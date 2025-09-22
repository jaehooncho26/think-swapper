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
const types_1 = require("../types");
const utils_1 = require("../utils");
const decorators_1 = require("./decorators");
const transform_decorators_1 = require("./transform-decorators");
describe("infinity", () => {
    it("validation should give errors when BigNumber is Infinity and has no flag", async () => {
        // Given
        class MockMintTokenDto extends types_1.ChainCallDTO {
        }
        tslib_1.__decorate([
            (0, transform_decorators_1.BigNumberProperty)(),
            tslib_1.__metadata("design:type", bignumber_js_1.default)
        ], MockMintTokenDto.prototype, "amount", void 0);
        const NewFake = new MockMintTokenDto();
        NewFake.amount = new bignumber_js_1.default(Infinity);
        // When
        const output = await NewFake.validate();
        // Then
        expect(output).toEqual([
            expect.objectContaining({
                constraints: expect.objectContaining({
                    BigNumberIsNotInfinity: "amount must be finite BigNumber but is Infinity"
                })
            })
        ]);
    });
    it("validation should give no errors when BigNumber is Infinity and has allowInfinity flag", async () => {
        // Given
        class MockMintTokenDto extends types_1.ChainCallDTO {
        }
        tslib_1.__decorate([
            (0, transform_decorators_1.BigNumberProperty)({ allowInfinity: true }),
            tslib_1.__metadata("design:type", bignumber_js_1.default)
        ], MockMintTokenDto.prototype, "amount", void 0);
        const NewFake = new MockMintTokenDto();
        NewFake.amount = new bignumber_js_1.default(Infinity);
        // eslint-disable-next-line
        const expectedSerializedSubstring = `{\"amount\":\"Infinity\"}`;
        // When
        const output = await NewFake.validate();
        const serialized = (0, utils_1.serialize)(NewFake);
        const deserialized = (0, utils_1.deserialize)(MockMintTokenDto, serialized);
        // Then
        // check validation errors
        expect(output).toEqual([]);
        // check serialization and deserialization works properly
        expect(serialized).toEqual(expectedSerializedSubstring);
        expect(deserialized.amount).toEqual(NewFake.amount);
    });
    it("validation should give no errors when BigNumber is finite", async () => {
        // Given
        class MockMintTokenDto extends types_1.ChainCallDTO {
        }
        tslib_1.__decorate([
            (0, transform_decorators_1.BigNumberProperty)(),
            tslib_1.__metadata("design:type", bignumber_js_1.default)
        ], MockMintTokenDto.prototype, "amount", void 0);
        const NewFake = new MockMintTokenDto();
        NewFake.amount = new bignumber_js_1.default(5);
        // eslint-disable-next-line
        const expectedSerializedSubstring = `{\"amount\":\"5\"}`;
        // When
        const output = await NewFake.validate();
        const serialized = (0, utils_1.serialize)(NewFake);
        const deserialized = (0, utils_1.deserialize)(MockMintTokenDto, serialized);
        // Then
        expect(output.length).toEqual(0);
        // Then
        // check validation errors
        expect(output).toEqual([]);
        // check serialization and deserialization works properly
        expect(serialized).toEqual(expectedSerializedSubstring);
        expect(deserialized.amount).toEqual(NewFake.amount);
    });
    it("validation should give no errors when BigNumber is optional and property is not present", async () => {
        // Given
        class MockDto extends types_1.ChainCallDTO {
        }
        tslib_1.__decorate([
            (0, class_validator_1.IsOptional)(),
            (0, decorators_1.BigNumberIsInteger)(),
            (0, decorators_1.BigNumberIsNotNegative)(),
            (0, transform_decorators_1.BigNumberProperty)(),
            tslib_1.__metadata("design:type", bignumber_js_1.default)
        ], MockDto.prototype, "amount", void 0);
        const NewFake = new MockDto();
        // const expectedSerializedString = `{}`;
        // When
        const output = await NewFake.validate();
        const serialized = (0, utils_1.serialize)(NewFake);
        const deserializezd = (0, utils_1.deserialize)(MockDto, serialized);
        // Then
        expect(output.length).toEqual(0);
        expect(output).toEqual([]);
        expect(deserializezd.amount).toBeUndefined();
    });
});
//# sourceMappingURL=transform-decorators.spec.js.map