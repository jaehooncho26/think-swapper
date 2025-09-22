"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrustWalletConnectClient = exports.getTrustWalletInjectedProvider = void 0;
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
const ethers_1 = require("ethers");
const BrowserConnectClient_1 = require("./BrowserConnectClient");
async function getTrustWalletInjectedProvider({ timeout } = { timeout: 3000 }) {
    const provider = new ethers_1.BrowserProvider(getTrustWalletFromWindow());
    if (provider) {
        return provider;
    }
    return listenForTrustWalletInitialized({ timeout });
}
exports.getTrustWalletInjectedProvider = getTrustWalletInjectedProvider;
async function listenForTrustWalletInitialized({ timeout } = { timeout: 3000 }) {
    return new Promise((resolve) => {
        const handleInitialization = () => {
            resolve(getTrustWalletFromWindow());
        };
        window.addEventListener("trustwallet#initialized", handleInitialization, {
            once: true
        });
        setTimeout(() => {
            window.removeEventListener("trustwallet#initialized", handleInitialization, false);
            resolve(undefined);
        }, timeout);
    });
}
function getTrustWalletFromWindow() {
    var _a, _b, _c;
    const isTrustWallet = (ethereum) => {
        // Identify if Trust Wallet injected provider is present.
        const trustWallet = !!(ethereum === null || ethereum === void 0 ? void 0 : ethereum.isTrust);
        return trustWallet;
    };
    const injectedProviderExist = typeof window !== "undefined" && typeof window.ethereum !== "undefined";
    // No injected providers exist.
    if (!injectedProviderExist) {
        return null;
    }
    // Trust Wallet was injected into window.ethereum.
    if (isTrustWallet(window.ethereum)) {
        return window.ethereum;
    }
    // Trust Wallet provider might be replaced by another
    // injected provider, check the providers array.
    if ((_a = window.ethereum) === null || _a === void 0 ? void 0 : _a.providers) {
        // ethereum.providers array is a non-standard way to
        // preserve multiple injected providers. Eventually, EIP-5749
        // will become a living standard and we will have to update this.
        return (_b = window.ethereum.providers.find(isTrustWallet)) !== null && _b !== void 0 ? _b : null;
    }
    // Trust Wallet injected provider is available in the global scope.
    // There are cases that some cases injected providers can replace window.ethereum
    // without updating the ethereum.providers array. To prevent issues where
    // the TW connector does not recognize the provider when TW extension is installed,
    // we begin our checks by relying on TW's global object.
    return (_c = window["trustwallet"]) !== null && _c !== void 0 ? _c : null;
}
class TrustWalletConnectClient extends BrowserConnectClient_1.BrowserConnectClient {
    constructor() {
        super();
        this.address = "";
    }
    async connect() {
        this.provider = await getTrustWalletInjectedProvider();
        return super.connect();
    }
}
exports.TrustWalletConnectClient = TrustWalletConnectClient;
//# sourceMappingURL=TrustWalletConnectClient.js.map