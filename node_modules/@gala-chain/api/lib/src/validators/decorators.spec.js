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
const class_validator_1 = require("class-validator");
const types_1 = require("../types");
const decorators_1 = require("./decorators");
describe("ArrayUniqueObject", () => {
    it("validation should give errors when two users have the same id", async () => {
        // Given
        class MockDto extends types_1.ChainCallDTO {
        }
        tslib_1.__decorate([
            (0, class_validator_1.ArrayNotEmpty)(),
            (0, decorators_1.ArrayUniqueObjects)("id"),
            tslib_1.__metadata("design:type", Array)
        ], MockDto.prototype, "users", void 0);
        const NewFake = new MockDto();
        NewFake.users = [{ id: 1 }, { id: 1 }, { id: 3 }];
        // When
        const output = await NewFake.validate();
        // Then
        expect(output).toEqual([
            expect.objectContaining({
                constraints: expect.objectContaining({
                    ArrayUniqueObjects: "users must not contains duplicate entry for id"
                })
            })
        ]);
    });
    it("validation should give errors when two users have the same id", async () => {
        // Given
        class MockDto extends types_1.ChainCallDTO {
        }
        tslib_1.__decorate([
            (0, class_validator_1.ArrayNotEmpty)(),
            (0, decorators_1.ArrayUniqueObjects)("id"),
            tslib_1.__metadata("design:type", Array)
        ], MockDto.prototype, "users", void 0);
        const NewFake = new MockDto();
        NewFake.users = [
            { id: 1, other: "yee" },
            { id: 1, other: "wee" },
            { id: 3, other: "hee" }
        ];
        // When
        const output = await NewFake.validate();
        // Then
        expect(output).toEqual([
            expect.objectContaining({
                constraints: expect.objectContaining({
                    ArrayUniqueObjects: "users must not contains duplicate entry for id"
                })
            })
        ]);
    });
    it("validation should pass when all users have different ids", async () => {
        // Given
        class MockDto extends types_1.ChainCallDTO {
        }
        tslib_1.__decorate([
            (0, class_validator_1.ArrayNotEmpty)(),
            (0, decorators_1.ArrayUniqueObjects)("id"),
            tslib_1.__metadata("design:type", Array)
        ], MockDto.prototype, "users", void 0);
        const NewFake = new MockDto();
        NewFake.users = [{ id: 1 }, { id: 2 }, { id: 3 }];
        // When
        const output = await NewFake.validate();
        // Then
        expect(output.length).toEqual(0);
    });
});
//# sourceMappingURL=decorators.spec.js.map