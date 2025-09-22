"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
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
const bignumber_js_1 = tslib_1.__importDefault(require("bignumber.js"));
const utils_1 = require("../utils");
const validators_1 = require("../validators");
const ChainObject_1 = require("./ChainObject");
const contract_1 = require("./contract");
class DummyClass extends ChainObject_1.ChainObject {
}
tslib_1.__decorate([
    (0, validators_1.BigNumberProperty)(),
    tslib_1.__metadata("design:type", bignumber_js_1.default)
], DummyClass.prototype, "maxSupply", void 0);
it("should deserialize response", () => {
    var _a;
    // Given
    const responseString = `{"Status":1,"Data":{"collection":"Platform","category":"Currency","type":"GALA","additionalKey":"none","network":"GC","totalMintAllowance":"0","maxSupply":"50000000000","maxCapacity":"50000000000","authorities":["org1|curatorUser"],"name":"GALA","symbol":"GALA","description":"This is a test description!","image":"https://app.gala.games/_nuxt/img/gala-logo_horizontal_white.8b0409c.png","isNonFungible":false,"totalBurned":"0","totalSupply":"0","decimals":8}}`;
    // When
    const deserialized = contract_1.GalaChainResponse.deserialize(DummyClass, responseString);
    // Then
    expect((_a = deserialized.Data) === null || _a === void 0 ? void 0 : _a.maxSupply).toEqual(new bignumber_js_1.default("50000000000"));
});
it("should deserialize array response", async () => {
    var _a, _b;
    // Given
    const responseString = `{"Status":1,"Data":[{"collection":"Platform","category":"Currency","type":"GALA","additionalKey":"none","network":"GC","totalMintAllowance":"0","maxSupply":"50000000000","maxCapacity":"50000000000","authorities":["org1|curatorUser"],"name":"GALA","symbol":"GALA","description":"This is a test description!","image":"https://app.gala.games/_nuxt/img/gala-logo_horizontal_white.8b0409c.png","isNonFungible":false,"totalBurned":"0","totalSupply":"0","decimals":8}]}`;
    // When
    const deserialized = contract_1.GalaChainResponse.deserialize(DummyClass, responseString);
    // Then
    expect((_b = (_a = deserialized.Data) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.maxSupply).toEqual(new bignumber_js_1.default("50000000000"));
});
it("should deserialize single string response", () => {
    // Given
    const responseString = `{"Status":1,"Data":"GALA"}`;
    // When
    const deserialized = contract_1.GalaChainResponse.deserialize(String, responseString);
    // Then
    expect(deserialized.Data).toEqual("GALA");
});
it("should deserialize string array response", () => {
    // Given
    const responseString = `{"Status":1,"Data":["GALA1","GALA2"]}`;
    // When
    // eslint-disable-next-line @typescript-eslint/ban-types
    const deserialized = contract_1.GalaChainResponse.deserialize(String, responseString);
    // Then
    expect(deserialized.Data).toEqual(["GALA1", "GALA2"]);
});
it("should deserialize error response", () => {
    // Given
    const responseString = `{"Status":0,"Message":"No object found","ErrorCode":404,"ErrorKey":"NOT_FOUND"}`;
    // When
    const deserialized = contract_1.GalaChainResponse.deserialize(DummyClass, responseString);
    // Then
    expect(deserialized).toEqual(contract_1.GalaChainResponse.Error(new utils_1.NotFoundError("No object found")));
});
//# sourceMappingURL=contract.spec.js.map