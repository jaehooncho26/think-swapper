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
const class_validator_1 = require("class-validator");
const utf8_1 = require("../ethers/utils/utf8");
const types_1 = require("../types");
const validators_1 = require("../validators");
const serialize_1 = tslib_1.__importDefault(require("./serialize"));
class TestDTO extends types_1.ChainCallDTO {
}
tslib_1.__decorate([
    (0, validators_1.BigNumberProperty)(),
    tslib_1.__metadata("design:type", bignumber_js_1.default)
], TestDTO.prototype, "quantity", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.ArrayMinSize)(1),
    tslib_1.__metadata("design:type", Array)
], TestDTO.prototype, "names", void 0);
class TestChainObject extends types_1.ChainObject {
}
tslib_1.__decorate([
    (0, validators_1.BigNumberProperty)(),
    tslib_1.__metadata("design:type", bignumber_js_1.default)
], TestChainObject.prototype, "quantity", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.ArrayMinSize)(1),
    tslib_1.__metadata("design:type", Array)
], TestChainObject.prototype, "names", void 0);
function createTestObjects(plain) {
    const dto = new TestDTO();
    dto.quantity = plain.quantity;
    dto.names = plain.names;
    const chainObject = new TestChainObject();
    chainObject.quantity = plain.quantity;
    chainObject.names = plain.names;
    return { dto, chainObject, plain };
}
it("should sort fields", () => {
    // Given
    const obj = { c: 8, b: [{ z: 6, y: 5, x: 4 }, 7], a: 3 };
    // When
    const serialized = (0, serialize_1.default)(obj);
    // Then
    expect(serialized).toEqual('{"a":3,"b":[{"x":4,"y":5,"z":6},7],"c":8}');
});
// Known issue, we used `sort-keys-recursive` before, which does sort arrays
it("should not sort arrays", () => {
    // Given
    const { dto, chainObject, plain } = createTestObjects({
        quantity: new bignumber_js_1.default("1.23"),
        names: ["Bob", "Alice", "Chris"]
    });
    const expectedClassS = '{"names":["Bob","Alice","Chris"],"quantity":"1.23"}';
    const expectedPlainS = '{"names":["Bob","Alice","Chris"],"quantity":{"c":[1,23000000000000],"e":0,"s":1}}';
    // When
    const [plainS, dtoS, chainObjectS] = [plain, dto, chainObject].map((o) => (0, serialize_1.default)(o));
    // Then
    expect(dtoS).toEqual(expectedClassS);
    expect(chainObjectS).toEqual(expectedClassS);
    expect(plainS).toEqual(expectedPlainS);
});
it("should handle very large numbers with decimals", () => {
    // Given
    const largeNumberS = "12300000000000000000000000000000.456"; // Note no exp notation
    const largeNumber = new bignumber_js_1.default(largeNumberS);
    expect(largeNumber.isGreaterThan(Number.MAX_SAFE_INTEGER)).toEqual(true);
    const { dto, chainObject, plain } = createTestObjects({
        quantity: largeNumber,
        names: ["Alice"]
    });
    const expectedClassS = `{"names":["Alice"],"quantity":"${largeNumberS}"}`;
    const expectedPlainS = '{"names":["Alice"],"quantity":{"c":[1230,0,0,45600000000000],"e":31,"s":1}}';
    // When
    const [plainS, dtoS, chainObjectS] = [plain, dto, chainObject].map((o) => (0, serialize_1.default)(o));
    // Then
    expect(dtoS).toEqual(expectedClassS);
    expect(chainObjectS).toEqual(expectedClassS);
    expect(plainS).toEqual(expectedPlainS);
});
it("should handle very large numbers with no decimals", () => {
    // Given
    const largeNumberS = "900000000000000000000000000000"; // Note no exp notation
    const largeNumber = new bignumber_js_1.default(largeNumberS);
    expect(largeNumber.isGreaterThan(Number.MAX_SAFE_INTEGER)).toEqual(true);
    const { dto, chainObject, plain } = createTestObjects({
        quantity: largeNumber,
        names: ["Alice"]
    });
    const expectedClassS = `{"names":["Alice"],"quantity":"${largeNumberS}"}`;
    const expectedPlainS = '{"names":["Alice"],"quantity":{"c":[90],"e":29,"s":1}}';
    // When
    const [plainS, dtoS, chainObjectS] = [plain, dto, chainObject].map((o) => (0, serialize_1.default)(o));
    // Then
    expect(dtoS).toEqual(expectedClassS);
    expect(chainObjectS).toEqual(expectedClassS);
    expect(plainS).toEqual(expectedPlainS);
});
it("Bignumber toUtf8Bytes", () => {
    const bigNumber = (0, bignumber_js_1.default)("300");
    expect((0, utf8_1.toUtf8Bytes)(bigNumber)).toEqual((0, utf8_1.toUtf8Bytes)("300"));
});
//# sourceMappingURL=serialize.spec.js.map