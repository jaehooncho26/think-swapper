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
const bignumber_js_1 = require("bignumber.js");
const class_transformer_1 = require("class-transformer");
const utils_1 = require("../utils");
const validators_1 = require("../validators");
const ChainObject_1 = require("./ChainObject");
class TestClass extends ChainObject_1.ChainObject {
    constructor(bigNum, category) {
        super();
        this.bigNum = bigNum;
        this.category = category;
    }
}
TestClass.INDEX_KEY = "test";
tslib_1.__decorate([
    (0, utils_1.ChainKey)({ position: 0 }),
    (0, validators_1.BigNumberProperty)(),
    tslib_1.__metadata("design:type", bignumber_js_1.BigNumber)
], TestClass.prototype, "bigNum", void 0);
tslib_1.__decorate([
    (0, utils_1.ChainKey)({ position: 1 }),
    (0, class_transformer_1.Transform)(({ value }) => `category.${value}`),
    tslib_1.__metadata("design:type", String)
], TestClass.prototype, "category", void 0);
it("should use custom serializers while constructing composite key", () => {
    // Given
    const bigNumStr = "730750818665451215712927172538123444058715062271"; // MAX_SAFE_INTEGER^3
    const bigNum = new bignumber_js_1.BigNumber(bigNumStr);
    expect(bigNum.toString()).toEqual(expect.stringContaining("e+")); // by default converted to exp notation
    const dto = new TestClass(bigNum, "legendary");
    const expectedKey = ["", TestClass.INDEX_KEY, bigNumStr, `category.legendary`, ""].join("\u0000");
    // When
    const key = dto.getCompositeKey();
    // Then
    expect(key).toEqual(expectedKey);
});
//# sourceMappingURL=ChainObject.spec.js.map