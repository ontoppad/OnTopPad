import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createWalletClient, custom, numberToHex, type Address, type EIP1193Provider, type WalletClient } from "viem";
import { useQuery } from "@tanstack/react-query";
import { chain, publicClient } from "./chain.ts";

interface ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}
interface ProviderDetail {
  info: ProviderInfo;
  provider: EIP1193Provider;
}

interface WalletState {
  address?: Address;
  providers: ProviderDetail[];
  client?: WalletClient;
  wrongChain: boolean;
  balance?: bigint;
  picker: boolean;
  openPicker: () => void;
  closePicker: () => void;
  connect: (p: ProviderDetail) => Promise<void>;
  disconnect: () => void;
  ensureChain: () => Promise<void>;
}

const Ctx = createContext<WalletState | null>(null);
const KEY = "ontop-wallet";

function remember(rdns: string | null) {
  try {
    if (rdns) localStorage.setItem(KEY, rdns);
    else localStorage.removeItem(KEY);
  } catch {
    // storage blocked: reconnect just asks again
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [providers, setProviders] = useState<ProviderDetail[]>([]);
  const [active, setActive] = useState<ProviderDetail>();
  const [address, setAddress] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [picker, setPicker] = useState(false);

  // EIP-6963: every installed wallet announces itself; window.ethereum is the fallback for older ones
  useEffect(() => {
    const seen = new Map<string, ProviderDetail>();
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent<ProviderDetail>).detail;
      seen.set(d.info.uuid, d);
      setProviders([...seen.values()]);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const t = setTimeout(() => {
      const eth = (window as { ethereum?: EIP1193Provider }).ethereum;
      if (seen.size === 0 && eth) {
        setProviders([{ info: { uuid: "injected", name: "Browser wallet", icon: "", rdns: "injected" }, provider: eth }]);
      }
    }, 400);
    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      clearTimeout(t);
    };
  }, []);

  const bind = useCallback(async (p: ProviderDetail, ask: boolean) => {
    const accounts = (await p.provider.request({ method: ask ? "eth_requestAccounts" : "eth_accounts" })) as Address[];
    if (!accounts[0]) return;
    setActive(p);
    setAddress(accounts[0]);
    setChainId(Number(await p.provider.request({ method: "eth_chainId" })));
    remember(p.info.rdns);
  }, []);

  // silent reconnect to the last wallet used
  useEffect(() => {
    let last: string | null = null;
    try {
      last = localStorage.getItem(KEY);
    } catch {
      return;
    }
    const p = providers.find((x) => x.info.rdns === last);
    if (p && !active) void bind(p, false).catch(() => remember(null));
  }, [providers, active, bind]);

  useEffect(() => {
    if (!active) return;
    const onAccounts = (a: unknown) => {
      const list = a as Address[];
      if (list[0]) setAddress(list[0]);
      else {
        setActive(undefined);
        setAddress(undefined);
        remember(null);
      }
    };
    const onChain = (id: unknown) => setChainId(Number(id));
    active.provider.on?.("accountsChanged", onAccounts);
    active.provider.on?.("chainChanged", onChain);
    return () => {
      active.provider.removeListener?.("accountsChanged", onAccounts);
      active.provider.removeListener?.("chainChanged", onChain);
    };
  }, [active]);

  const ensureChain = useCallback(async () => {
    if (!active || chainId === chain.id) return;
    const hex = numberToHex(chain.id);
    try {
      await active.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch (e) {
      if ((e as { code?: number }).code !== 4902) throw e;
      await active.provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hex,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: chain.rpcUrls.default.http,
            blockExplorerUrls: [chain.blockExplorers!.default.url],
          },
        ],
      });
    }
    setChainId(chain.id);
  }, [active, chainId]);

  const client = useMemo(
    () => (active && address ? createWalletClient({ account: address, chain, transport: custom(active.provider) }) : undefined),
    [active, address],
  );

  const { data: balance } = useQuery({
    queryKey: ["balance", address],
    queryFn: () => publicClient.getBalance({ address: address! }),
    enabled: !!address,
    refetchInterval: 10_000,
  });

  const value: WalletState = {
    address,
    providers,
    client,
    wrongChain: !!address && chainId !== chain.id,
    balance,
    picker,
    openPicker: () => setPicker(true),
    closePicker: () => setPicker(false),
    connect: async (p) => {
      await bind(p, true);
      setPicker(false);
    },
    disconnect: () => {
      setActive(undefined);
      setAddress(undefined);
      remember(null);
    },
    ensureChain,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}
