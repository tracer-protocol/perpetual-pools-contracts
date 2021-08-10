// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "./PriceChanger.sol";
import "../interfaces/IPriceChangerDeployer.sol";

/*
@title The deployer of PriceChanger and PoolCommitter
*/
contract PriceChangerDeployer is IPriceChangerDeployer {
    function deploy(address feeAddress, address factory) external override returns (address priceChanger) {
        priceChanger = address(new PriceChanger(feeAddress, factory));
    }
}