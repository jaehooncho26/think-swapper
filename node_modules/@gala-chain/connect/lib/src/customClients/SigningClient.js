"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SigningClient = void 0;
/*
 * Copyright (c) Gala Games Inc. All rights reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const api_1 = require("@gala-chain/api");
const ethers_1 = require("ethers");
const GalaChainClient_1 = require("../GalaChainClient");
const helpers_1 = require("../helpers");
const types_1 = require("../types");
const utils_1 = require("../utils");
class SigningClient extends GalaChainClient_1.CustomClient {
    get ethereumAddress() {
        return this.wallet.address;
    }
    get galaChainAddress() {
        return (0, utils_1.ethereumToGalaChainAddress)(this.wallet.address);
    }
    async getPublicKey() {
        const message = "I <3 GalaChain";
        const signedMessage = await this.wallet.signMessage(message);
        const publicKey = ethers_1.SigningKey.recoverPublicKey((0, ethers_1.hashMessage)(message), signedMessage);
        const recoveredAddress = (0, ethers_1.computeAddress)(publicKey);
        return { publicKey, recoveredAddress };
    }
    constructor(privateKey, options) {
        super(options);
        this.wallet = new ethers_1.ethers.Wallet(privateKey);
    }
    async sign(method, payload, signingType) {
        var _a, _b;
        if (signingType === void 0) { signingType = (_b = (_a = this.options) === null || _a === void 0 ? void 0 : _a.signingType) !== null && _b !== void 0 ? _b : types_1.SigningType.SIGN_TYPED_DATA; }
        try {
            const prefix = (0, helpers_1.calculatePersonalSignPrefix)(payload);
            const prefixedPayload = { ...payload, prefix };
            if (signingType === types_1.SigningType.SIGN_TYPED_DATA) {
                const domain = { name: "GalaChain" };
                const types = (0, utils_1.generateEIP712Types)(method, payload);
                const signature = await this.wallet.signTypedData(domain, types, prefixedPayload);
                return { ...prefixedPayload, signature, types, domain };
            }
            else if (signingType === types_1.SigningType.PERSONAL_SIGN) {
                const signature = await this.wallet.signMessage((0, api_1.serialize)(prefixedPayload));
                return { ...prefixedPayload, signature };
            }
            else {
                throw new Error("Unsupported signing type");
            }
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
}
exports.SigningClient = SigningClient;
//# sourceMappingURL=SigningClient.js.map