"use strict";
/**
 *  Cryptographic hashing functions
 *
 *  @_subsection: api/crypto:Hash Functions [about-crypto-hashing]
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.keccak256 = void 0;
/*
 I changed this to save us a bit of space rather than import another keccak lib
 import { keccak_256 } from "@noble/hashes/sha3";
*/
const js_sha3_1 = require("js-sha3");
const data_1 = require("../utils/data");
let locked = false;
const _keccak256 = function (data) {
    return new Uint8Array(js_sha3_1.keccak256.arrayBuffer(data));
};
let __keccak256 = _keccak256;
/**
 *  Compute the cryptographic KECCAK256 hash of %%data%%.
 *
 *  The %%data%% **m
 * ust** be a data representation, to compute the
 *  hash of UTF-8 data use the [[id]] function.
 *
 *  @returns DataHexstring
 *  @example:
 *    keccak256("0x")
 *    //_result:
 *
 *    keccak256("0x1337")
 *    //_result:
 *
 *    keccak256(new Uint8Array([ 0x13, 0x37 ]))
 *    //_result:
 *
 *    // Strings are assumed to be DataHexString, otherwise it will
 *    // throw. To hash UTF-8 data, see the note above.
 *    keccak256("Hello World")
 *    //_error:
 */
function keccak256(_data) {
    const data = (0, data_1.getBytes)(_data, "data");
    return (0, data_1.hexlify)(__keccak256(data));
}
exports.keccak256 = keccak256;
keccak256._ = _keccak256;
keccak256.lock = function () {
    locked = true;
};
keccak256.register = function (func) {
    if (locked) {
        throw new TypeError("keccak256 is locked");
    }
    __keccak256 = func;
};
Object.freeze(keccak256);
//# sourceMappingURL=keccak_256.js.map