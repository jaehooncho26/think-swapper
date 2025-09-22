"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeeCodeDefinition = exports.FeeAccelerationRateType = void 0;
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
const class_validator_1 = require("class-validator");
const utils_1 = require("../utils");
const validators_1 = require("../validators");
const ChainObject_1 = require("./ChainObject");
var FeeAccelerationRateType;
(function (FeeAccelerationRateType) {
    FeeAccelerationRateType[FeeAccelerationRateType["CuratorDefined"] = 0] = "CuratorDefined";
    // optional? todo: define mathematically increasing fee schedules
    FeeAccelerationRateType[FeeAccelerationRateType["Additive"] = 1] = "Additive";
    FeeAccelerationRateType[FeeAccelerationRateType["Multiplicative"] = 2] = "Multiplicative";
    FeeAccelerationRateType[FeeAccelerationRateType["Exponential"] = 3] = "Exponential";
    FeeAccelerationRateType[FeeAccelerationRateType["Logarithmic"] = 4] = "Logarithmic";
    FeeAccelerationRateType[FeeAccelerationRateType["Custom"] = 5] = "Custom";
})(FeeAccelerationRateType || (exports.FeeAccelerationRateType = FeeAccelerationRateType = {}));
class FeeCodeDefinition extends ChainObject_1.ChainObject {
}
exports.FeeCodeDefinition = FeeCodeDefinition;
FeeCodeDefinition.INDEX_KEY = "GCFD";
FeeCodeDefinition.DECIMAL_PRECISION = 8;
tslib_1.__decorate([
    (0, utils_1.ChainKey)({ position: 0 }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], FeeCodeDefinition.prototype, "feeCode", void 0);
tslib_1.__decorate([
    (0, utils_1.ChainKey)({ position: 1 }),
    (0, validators_1.BigNumberIsNotNegative)(),
    (0, validators_1.BigNumberIsInteger)(),
    (0, validators_1.BigNumberProperty)(),
    tslib_1.__metadata("design:type", bignumber_js_1.BigNumber)
], FeeCodeDefinition.prototype, "feeThresholdUses", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsNumber)(),
    tslib_1.__metadata("design:type", Number)
], FeeCodeDefinition.prototype, "feeThresholdTimePeriod", void 0);
tslib_1.__decorate([
    (0, validators_1.BigNumberIsNotNegative)(),
    (0, validators_1.BigNumberProperty)(),
    tslib_1.__metadata("design:type", bignumber_js_1.BigNumber)
], FeeCodeDefinition.prototype, "baseQuantity", void 0);
tslib_1.__decorate([
    (0, validators_1.BigNumberIsNotNegative)(),
    (0, validators_1.BigNumberProperty)(),
    tslib_1.__metadata("design:type", bignumber_js_1.BigNumber)
], FeeCodeDefinition.prototype, "maxQuantity", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, validators_1.BigNumberIsNotNegative)(),
    (0, validators_1.BigNumberProperty)(),
    tslib_1.__metadata("design:type", bignumber_js_1.BigNumber)
], FeeCodeDefinition.prototype, "maxUses", void 0);
tslib_1.__decorate([
    (0, validators_1.EnumProperty)(FeeAccelerationRateType),
    tslib_1.__metadata("design:type", Number)
], FeeCodeDefinition.prototype, "feeAccelerationRateType", void 0);
tslib_1.__decorate([
    (0, validators_1.BigNumberProperty)(),
    tslib_1.__metadata("design:type", bignumber_js_1.BigNumber)
], FeeCodeDefinition.prototype, "feeAccelerationRate", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    tslib_1.__metadata("design:type", Boolean)
], FeeCodeDefinition.prototype, "isCrossChannel", void 0);
//# sourceMappingURL=FeeCodeDefinition.js.map