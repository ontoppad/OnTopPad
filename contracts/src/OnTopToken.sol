// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @title OnTopToken
/// @notice Fixed-supply token minted once by OnTopLaunchpad. No owner, no mint, no tax, no blacklist.
contract OnTopToken is ERC20, ERC20Burnable {
    /// @notice Off-chain metadata (image, description, links) set at launch, immutable afterwards.
    string public metadataURI;
    /// @notice Wallet that launched the token through OnTopLaunchpad.
    address public immutable creator;

    constructor(string memory name_, string memory symbol_, string memory metadataURI_, address creator_, uint256 supply)
        ERC20(name_, symbol_)
    {
        metadataURI = metadataURI_;
        creator = creator_;
        _mint(msg.sender, supply);
    }
}
