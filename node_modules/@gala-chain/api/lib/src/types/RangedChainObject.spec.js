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
const class_transformer_1 = require("class-transformer");
const utils_1 = require("../utils");
const RangedChainObject_1 = require("./RangedChainObject");
class TestRangedClass extends RangedChainObject_1.RangedChainObject {
    constructor(isNft, category) {
        super();
        this.isNft = isNft;
        this.category = category;
    }
}
TestRangedClass.INDEX_KEY = "ranged-test";
tslib_1.__decorate([
    (0, utils_1.ChainKey)({ position: 0 }),
    tslib_1.__metadata("design:type", Boolean)
], TestRangedClass.prototype, "isNft", void 0);
tslib_1.__decorate([
    (0, utils_1.ChainKey)({ position: 1 }),
    (0, class_transformer_1.Transform)(({ value }) => `cat.${value}`),
    tslib_1.__metadata("design:type", String)
], TestRangedClass.prototype, "category", void 0);
it("should use custom serializers while constructing ranged key", () => {
    // Given
    const obj = new TestRangedClass(true, "legendary");
    const expectedKey = [TestRangedClass.INDEX_KEY, "true", "cat.legendary"].join("\u0000");
    // When
    const key = obj.getRangedKey();
    // Then
    expect(key).toEqual(expectedKey);
});
//# sourceMappingURL=RangedChainObject.spec.js.map