"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recoverAddress = exports.computeAddress = void 0;
const js_sha3_1 = require("js-sha3");
const address_1 = require("../address");
const signing_key_1 = require("../crypto/signing-key");
/**
 *  Returns the address for the %%key%%.
 *
 *  The key may be any standard form of public key or a private key.
 */
function computeAddress(key) {
    let pubkey;
    if (typeof key === "string") {
        pubkey = signing_key_1.SigningKey.computePublicKey(key, false);
    }
    else {
        pubkey = key.publicKey;
    }
    return (0, address_1.getAddress)((0, js_sha3_1.keccak256)("0x" + pubkey.substring(4)).substring(26));
}
exports.computeAddress = computeAddress;
/**
 *  Returns the recovered address for the private key that was
 *  used to sign %%digest%% that resulted in %%signature%%.
 */
function recoverAddress(digest, signature) {
    return computeAddress(signing_key_1.SigningKey.recoverPublicKey(digest, signature));
}
exports.recoverAddress = recoverAddress;
//# sourceMappingURL=address.js.map