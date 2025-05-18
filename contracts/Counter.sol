// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Counter {
    uint256 public number;

    event NumberChanged(string action, uint256 newValue);

    function increase() public {
        number += 10; // 改為加10
        emit NumberChanged("increase", number);
    }

    function decrease() public {
        require(number >= 5, "Underflow!"); // 要至少 5 才能減
        number -= 5; // 改為減5
        emit NumberChanged("decrease", number);
    }
}
