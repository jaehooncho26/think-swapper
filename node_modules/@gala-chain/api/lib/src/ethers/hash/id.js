"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.id = void 0;
const keccak_256_1 = require("../crypto/keccak_256");
const utf8_1 = require("../utils/utf8");
/**
 *  A simple hashing function which operates on UTF-8 strings to
 *  compute an 32-byte identifier.
 *
 *  This simply computes the [UTF-8 bytes](toUtf8Bytes) and computes
 *  the [[keccak256]].
 *
 *  @example:
 *    id("hello world")
 *    //_result:
 */
function id(value) {
    return (0, keccak_256_1.keccak256)((0, utf8_1.toUtf8Bytes)(value));
}
exports.id = id;
//# sourceMappingURL=id.js.map