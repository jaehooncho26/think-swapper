"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenSwapRequest = void 0;
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
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const utils_1 = require("../utils");
const validators_1 = require("../validators");
const ChainObject_1 = require("./ChainObject");
const TokenInstance_1 = require("./TokenInstance");
class TokenSwapRequest extends ChainObject_1.ChainObject {
}
exports.TokenSwapRequest = TokenSwapRequest;
TokenSwapRequest.INDEX_KEY = "GCTSR";
tslib_1.__decorate([
    (0, utils_1.ChainKey)({ position: 0 }),
    (0, class_validator_1.IsNumber)(),
    tslib_1.__metadata("design:type", Number)
], TokenSwapRequest.prototype, "created", void 0);
tslib_1.__decorate([
    (0, utils_1.ChainKey)({ position: 1 }),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], TokenSwapRequest.prototype, "txid", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], TokenSwapRequest.prototype, "swapRequestId", void 0);
tslib_1.__decorate([
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => TokenInstance_1.TokenInstanceQuantity),
    (0, class_validator_1.ArrayNotEmpty)(),
    tslib_1.__metadata("design:type", Array)
], TokenSwapRequest.prototype, "offered", void 0);
tslib_1.__decorate([
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => TokenInstance_1.TokenInstanceQuantity),
    (0, class_validator_1.ArrayNotEmpty)(),
    tslib_1.__metadata("design:type", Array)
], TokenSwapRequest.prototype, "wanted", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, validators_1.IsUserAlias)(),
    tslib_1.__metadata("design:type", String)
], TokenSwapRequest.prototype, "offeredTo", void 0);
tslib_1.__decorate([
    (0, validators_1.IsUserAlias)(),
    tslib_1.__metadata("design:type", String)
], TokenSwapRequest.prototype, "offeredBy", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsNotEmpty)() // i.e. not null/undefined, it can be an empty array
    ,
    tslib_1.__metadata("design:type", Array)
], TokenSwapRequest.prototype, "fillIds", void 0);
tslib_1.__decorate([
    (0, validators_1.BigNumberIsPositive)(),
    (0, validators_1.BigNumberIsInteger)(),
    (0, validators_1.BigNumberProperty)(),
    tslib_1.__metadata("design:type", bignumber_js_1.default)
], TokenSwapRequest.prototype, "uses", void 0);
tslib_1.__decorate([
    (0, validators_1.BigNumberIsPositive)(),
    (0, validators_1.BigNumberIsInteger)(),
    (0, validators_1.BigNumberProperty)(),
    tslib_1.__metadata("design:type", bignumber_js_1.default)
], TokenSwapRequest.prototype, "usesSpent", void 0);
tslib_1.__decorate([
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsInt)(),
    tslib_1.__metadata("design:type", Number)
], TokenSwapRequest.prototype, "expires", void 0);
tslib_1.__decorate([
    (0, class_transformer_1.Exclude)(),
    tslib_1.__metadata("design:type", Object)
], TokenSwapRequest, "INDEX_KEY", void 0);
//# sourceMappingURL=TokenSwapRequest.js.map