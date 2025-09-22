"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OracleBridgeFeeAssertion = void 0;
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
const OraclePriceAssertion_1 = require("./OraclePriceAssertion");
const OraclePriceCrossRateAssertion_1 = require("./OraclePriceCrossRateAssertion");
const TokenClass_1 = require("./TokenClass");
let OracleBridgeFeeAssertion = class OracleBridgeFeeAssertion extends ChainObject_1.ChainObject {
};
exports.OracleBridgeFeeAssertion = OracleBridgeFeeAssertion;
OracleBridgeFeeAssertion.INDEX_KEY = "GCOAB"; // GalaChain Oracle Assertion: Bridge
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Name of the signing authoritative oracle defined on chain."
    }),
    (0, utils_1.ChainKey)({ position: 0 }),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], OracleBridgeFeeAssertion.prototype, "oracle", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Signing identity making the assertion contained within the DTO."
    }),
    (0, utils_1.ChainKey)({ position: 1 }),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], OracleBridgeFeeAssertion.prototype, "signingIdentity", void 0);
tslib_1.__decorate([
    (0, utils_1.ChainKey)({ position: 2 }),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], OracleBridgeFeeAssertion.prototype, "txid", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Exchange Rate Price Assertion used to calculate Gas Fee"
    }),
    (0, class_validator_1.ValidateIf)((assertion) => !!assertion.galaExchangeCrossRate),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => OraclePriceAssertion_1.OraclePriceAssertion),
    tslib_1.__metadata("design:type", OraclePriceAssertion_1.OraclePriceAssertion)
], OracleBridgeFeeAssertion.prototype, "galaExchangeRate", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Cross-Rate Exchange Rate used to calculate Gas Fee"
    }),
    (0, class_validator_1.ValidateIf)((assertion) => !!assertion.galaExchangeRate),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => OraclePriceCrossRateAssertion_1.OraclePriceCrossRateAssertion),
    tslib_1.__metadata("design:type", OraclePriceCrossRateAssertion_1.OraclePriceCrossRateAssertion)
], OracleBridgeFeeAssertion.prototype, "galaExchangeCrossRate", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Rounding decimals used for estimatedTotalTxFeeInGala. " +
            "Expected to match $GALA TokenClass.decimals."
    }),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(32),
    tslib_1.__metadata("design:type", Number)
], OracleBridgeFeeAssertion.prototype, "galaDecimals", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "The token requested to bridge. Token Class used to query the estimated transaction fee units."
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => TokenClass_1.TokenClassKey),
    tslib_1.__metadata("design:type", TokenClass_1.TokenClassKey)
], OracleBridgeFeeAssertion.prototype, "bridgeToken", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Set to true if the query to the bridge validator for the bridge-request token " +
            "included ?nft=true. Otherwise false."
    }),
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], OracleBridgeFeeAssertion.prototype, "bridgeTokenIsNonFungible", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Estimated number of gas units required for the transaction."
    }),
    (0, validators_1.BigNumberProperty)(),
    tslib_1.__metadata("design:type", bignumber_js_1.default)
], OracleBridgeFeeAssertion.prototype, "estimatedTxFeeUnitsTotal", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Estimated price per unit of gas, as retrieved approximately at the time of assertion."
    }),
    (0, validators_1.BigNumberProperty)(),
    tslib_1.__metadata("design:type", bignumber_js_1.default)
], OracleBridgeFeeAssertion.prototype, "estimatedPricePerTxFeeUnit", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "The sum total of the estimated transaction fee " +
            "denominated in the destinaton chain's native currency, token, or unit. " +
            "The denomination used is identified in the `externalToken` property. " +
            "The unit, currency, and/or token used to denominate the " +
            "`estimatedTotalTxFeeInExternalToken` property is specified in the " +
            "galaExchangeRate.externalQuoteToken property. " +
            "This total is calculated by multiplying the `estimatedTxFeeUnitsTotal` " +
            "times the `estimatedPricePerTxFeeUnit`, and then, if necessary, converting " +
            "the result to the `galaExchangeRate.externalQuoteToken unit denomination.`"
    }),
    (0, validators_1.BigNumberProperty)(),
    tslib_1.__metadata("design:type", bignumber_js_1.default)
], OracleBridgeFeeAssertion.prototype, "estimatedTotalTxFeeInExternalToken", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Conversion of the estimated transaction fee calculated for the " +
            "destination chain, converted to $GALA, for payment on GalaChain"
    }),
    (0, validators_1.BigNumberProperty)(),
    tslib_1.__metadata("design:type", bignumber_js_1.default)
], OracleBridgeFeeAssertion.prototype, "estimatedTotalTxFeeInGala", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Unix timestamp representing the date/time at which this assertion " +
            "was calculated and/or estimated."
    }),
    (0, class_validator_1.IsNumber)(),
    tslib_1.__metadata("design:type", Number)
], OracleBridgeFeeAssertion.prototype, "timestamp", void 0);
exports.OracleBridgeFeeAssertion = OracleBridgeFeeAssertion = tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Response with signed bridging fee data."
    })
], OracleBridgeFeeAssertion);
//# sourceMappingURL=OracleBridgeFeeAssertion.js.map