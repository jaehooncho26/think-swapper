"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OraclePriceAssertion = exports.ExternalToken = void 0;
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
const class_validator_jsonschema_1 = require("class-validator-jsonschema");
const utils_1 = require("../utils");
const validators_1 = require("../validators");
const ChainObject_1 = require("./ChainObject");
const TokenInstance_1 = require("./TokenInstance");
let ExternalToken = class ExternalToken extends ChainObject_1.ChainObject {
};
exports.ExternalToken = ExternalToken;
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: `Name of the external currency, e.g. "Ethereum"`
    }),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], ExternalToken.prototype, "name", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: `Symbol of the external currency, e.g. "ETH"`
    }),
    tslib_1.__metadata("design:type", String)
], ExternalToken.prototype, "symbol", void 0);
exports.ExternalToken = ExternalToken = tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "External token/currency definition. Use to specify an external currency that does not have a TokenClass defined on GalaChain."
    })
], ExternalToken);
class OraclePriceAssertion extends ChainObject_1.ChainObject {
}
exports.OraclePriceAssertion = OraclePriceAssertion;
OraclePriceAssertion.INDEX_KEY = "GCOAP"; // GalaChain Oracle Assertion: Price
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Name of the signing authoritative oracle defined on chain."
    }),
    (0, utils_1.ChainKey)({ position: 0 }),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], OraclePriceAssertion.prototype, "oracle", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Signing identity making the assertion contained within the DTO."
    }),
    (0, utils_1.ChainKey)({ position: 1 }),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], OraclePriceAssertion.prototype, "identity", void 0);
tslib_1.__decorate([
    (0, utils_1.ChainKey)({ position: 2 }),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], OraclePriceAssertion.prototype, "txid", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "First currency in the described currency pair. Unit of exchange."
    }),
    (0, class_validator_1.ValidateIf)((assertion) => !!assertion.externalBaseToken),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => TokenInstance_1.TokenInstanceKey),
    tslib_1.__metadata("design:type", TokenInstance_1.TokenInstanceKey)
], OraclePriceAssertion.prototype, "baseToken", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "External token representing the first currency in the described currency pair. " +
            "Unit of exchange. Optional, but required if baseToken is not provided."
    }),
    (0, class_validator_1.ValidateIf)((assertion) => !!assertion.baseToken),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ExternalToken),
    tslib_1.__metadata("design:type", ExternalToken)
], OraclePriceAssertion.prototype, "externalBaseToken", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Second token/currency in the pair. Token/Currency in which the baseToken is quoted. " +
            "Optional, but required if externalQuoteToken is not provided."
    }),
    (0, class_validator_1.ValidateIf)((o) => !o.externalQuoteToken),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => TokenInstance_1.TokenInstanceKey),
    tslib_1.__metadata("design:type", TokenInstance_1.TokenInstanceKey)
], OraclePriceAssertion.prototype, "quoteToken", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Second token/currency in the pair. Token/Currency in which the baseToken is quoted. " +
            "Optional, but required if quoteToken is not provided."
    }),
    (0, class_validator_1.ValidateIf)((o) => !o.quoteToken),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ExternalToken),
    tslib_1.__metadata("design:type", ExternalToken)
], OraclePriceAssertion.prototype, "externalQuoteToken", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "How much of the quoteToken is needed to purchase one unit of the baseToken."
    }),
    (0, validators_1.BigNumberProperty)(),
    tslib_1.__metadata("design:type", bignumber_js_1.default)
], OraclePriceAssertion.prototype, "exchangeRate", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "(Optional). Base Token quantity from conversion to/from quote token quantity."
    }),
    (0, class_validator_1.IsOptional)(),
    (0, validators_1.BigNumberProperty)(),
    tslib_1.__metadata("design:type", bignumber_js_1.default)
], OraclePriceAssertion.prototype, "baseTokenQuantity", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "(Optional). Quote token quantity from conversion to/from base token quantity."
    }),
    (0, class_validator_1.IsOptional)(),
    (0, validators_1.BigNumberProperty)(),
    tslib_1.__metadata("design:type", bignumber_js_1.default)
], OraclePriceAssertion.prototype, "quoteTokenQuantity", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "(Optional) Source of price data. Name of Third Party data source."
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], OraclePriceAssertion.prototype, "source", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "(Optional) URL referencing source data."
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], OraclePriceAssertion.prototype, "sourceUrl", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Unix timestamp representing the date/time at which this price / exchange rate was calculated or estimated."
    }),
    (0, class_validator_1.IsNumber)(),
    tslib_1.__metadata("design:type", Number)
], OraclePriceAssertion.prototype, "timestamp", void 0);
//# sourceMappingURL=OraclePriceAssertion.js.map