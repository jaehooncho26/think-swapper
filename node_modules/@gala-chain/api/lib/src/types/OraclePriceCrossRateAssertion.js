"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OraclePriceCrossRateAssertion = void 0;
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
const class_validator_1 = require("class-validator");
const class_validator_jsonschema_1 = require("class-validator-jsonschema");
const utils_1 = require("../utils");
const ChainObject_1 = require("./ChainObject");
const OraclePriceAssertion_1 = require("./OraclePriceAssertion");
class OraclePriceCrossRateAssertion extends ChainObject_1.ChainObject {
}
exports.OraclePriceCrossRateAssertion = OraclePriceCrossRateAssertion;
OraclePriceCrossRateAssertion.INDEX_KEY = "GCOC"; // GalaChain Oracle Cross-rate
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Name of the signing authoritative oracle defined on chain."
    }),
    (0, utils_1.ChainKey)({ position: 0 }),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], OraclePriceCrossRateAssertion.prototype, "oracle", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Signing identity making the assertion within the DTO."
    }),
    (0, utils_1.ChainKey)({ position: 1 }),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], OraclePriceCrossRateAssertion.prototype, "identity", void 0);
tslib_1.__decorate([
    (0, utils_1.ChainKey)({ position: 2 }),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], OraclePriceCrossRateAssertion.prototype, "txid", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Chain key referencing the saved baseToken price assertion"
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => OraclePriceAssertion_1.OraclePriceAssertion),
    tslib_1.__metadata("design:type", OraclePriceAssertion_1.OraclePriceAssertion)
], OraclePriceCrossRateAssertion.prototype, "baseTokenCrossRate", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Chain key referencing the saved quote token price assertion"
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => OraclePriceAssertion_1.OraclePriceAssertion),
    tslib_1.__metadata("design:type", OraclePriceAssertion_1.OraclePriceAssertion)
], OraclePriceCrossRateAssertion.prototype, "quoteTokenCrossRate", void 0);
//# sourceMappingURL=OraclePriceCrossRateAssertion.js.map