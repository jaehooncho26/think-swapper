"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeeCodeSplitFormula = exports.FeeCodeTransferQuantity = exports.FeeCodeTransferPercentage = void 0;
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
const class_validator_1 = require("class-validator");
const class_validator_jsonschema_1 = require("class-validator-jsonschema");
const utils_1 = require("../utils");
const utils_2 = require("../utils");
const validators_1 = require("../validators");
const ChainObject_1 = require("./ChainObject");
let FeeCodeTransferPercentage = class FeeCodeTransferPercentage extends ChainObject_1.ChainObject {
};
exports.FeeCodeTransferPercentage = FeeCodeTransferPercentage;
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "User identity / GalaChain address representing the address to which this " +
            "portion of the fee should be transferred."
    }),
    (0, validators_1.IsUserAlias)(),
    tslib_1.__metadata("design:type", String)
], FeeCodeTransferPercentage.prototype, "transferToUser", void 0);
tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "A number between 0 and 1 that represents the percentage / proportion " +
            "of the total fee which should be transferred to the accompany user identity / address. " +
            "e.g 0.1 for '10%'. "
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1),
    tslib_1.__metadata("design:type", Number)
], FeeCodeTransferPercentage.prototype, "transferPercentage", void 0);
exports.FeeCodeTransferPercentage = FeeCodeTransferPercentage = tslib_1.__decorate([
    (0, class_validator_jsonschema_1.JSONSchema)({
        description: "Define an address/identity to which a percentage of Fees should be transferred."
    })
], FeeCodeTransferPercentage);
class FeeCodeTransferQuantity extends ChainObject_1.ChainObject {
}
exports.FeeCodeTransferQuantity = FeeCodeTransferQuantity;
tslib_1.__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], FeeCodeTransferQuantity.prototype, "transferToUser", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1),
    tslib_1.__metadata("design:type", Number)
], FeeCodeTransferQuantity.prototype, "transferPercentage", void 0);
tslib_1.__decorate([
    (0, validators_1.IsBigNumber)(),
    (0, validators_1.BigNumberIsPositive)(),
    tslib_1.__metadata("design:type", bignumber_js_1.BigNumber)
], FeeCodeTransferQuantity.prototype, "transferQuantity", void 0);
class FeeCodeSplitFormula extends ChainObject_1.ChainObject {
    calculateAmounts(totalFeeQuantity, tokenDecimals) {
        const burnPercentage = this.burnPercentage;
        const transferPercentages = this.transferPercentages;
        const transferQuantities = [];
        let remainingFeeQuantity = totalFeeQuantity.decimalPlaces(tokenDecimals);
        for (let i = 0; i < transferPercentages.length; i++) {
            let amount;
            if (burnPercentage === 0 && i + 1 === transferPercentages.length) {
                // last one, assign remainder, avoid roundings errors from multiplication
                amount = remainingFeeQuantity.decimalPlaces(tokenDecimals);
            }
            else {
                amount = totalFeeQuantity
                    .times(transferPercentages[i].transferPercentage)
                    .decimalPlaces(tokenDecimals);
                remainingFeeQuantity = remainingFeeQuantity.minus(amount);
            }
            const transferQuantity = (0, class_transformer_1.plainToInstance)(FeeCodeTransferQuantity, {
                transferToUser: transferPercentages[i].transferToUser,
                transferPercentage: transferPercentages[i].transferPercentage,
                transferQuantity: amount
            });
            transferQuantities.push(transferQuantity);
        }
        const burnQuantity = remainingFeeQuantity;
        return [burnQuantity, transferQuantities];
    }
    async validatePercentages() {
        let percentageTotal = this.burnPercentage;
        const transferPercentages = [];
        for (const t of this.transferPercentages) {
            percentageTotal = percentageTotal + t.transferPercentage;
            transferPercentages.push(t.transferPercentage);
        }
        if (percentageTotal !== 1) {
            throw new utils_2.ValidationFailedError(`FeeCodeSplitFormula's burnPercentage and transferPercentages must add up to exactly 1.0. ` +
                `Calculated ${percentageTotal} from burnPercentage ${this.burnPercentage} and ` +
                `transferPercentages ${transferPercentages.join(",")}`);
        }
        return this;
    }
}
exports.FeeCodeSplitFormula = FeeCodeSplitFormula;
FeeCodeSplitFormula.INDEX_KEY = "GCFS";
tslib_1.__decorate([
    (0, utils_1.ChainKey)({ position: 0 }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], FeeCodeSplitFormula.prototype, "feeCode", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1),
    tslib_1.__metadata("design:type", Number)
], FeeCodeSplitFormula.prototype, "burnPercentage", void 0);
tslib_1.__decorate([
    (0, class_validator_1.ArrayMinSize)(0),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => FeeCodeTransferPercentage),
    tslib_1.__metadata("design:type", Array)
], FeeCodeSplitFormula.prototype, "transferPercentages", void 0);
tslib_1.__decorate([
    (0, class_transformer_1.Exclude)(),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [bignumber_js_1.BigNumber, Number]),
    tslib_1.__metadata("design:returntype", Array)
], FeeCodeSplitFormula.prototype, "calculateAmounts", null);
tslib_1.__decorate([
    (0, class_transformer_1.Exclude)(),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", Promise)
], FeeCodeSplitFormula.prototype, "validatePercentages", null);
//# sourceMappingURL=FeeCodeSplitFormula.js.map