// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TwinVault.sol";

/// @title TwinVaultFactory
/// @notice Deploys per-user TwinVault contracts. The factory itself is
///         deployed once per network and indexed via the
///         `VaultDeployed(owner, agent, vault)` event so the app can
///         enumerate every vault a user has ever owned.
contract TwinVaultFactory {
    event VaultDeployed(address indexed owner, address indexed agent, address vault);

    /// Deploy a vault. Anyone can call — `owner` and `agent` are set on
    /// construction, and the deployer (the dev wallet at onboarding time)
    /// has no privileged role. Returns the vault address.
    function deploy(address owner, address agent) external returns (address vault) {
        TwinVault v = new TwinVault(owner, agent);
        vault = address(v);
        emit VaultDeployed(owner, agent, vault);
    }
}
