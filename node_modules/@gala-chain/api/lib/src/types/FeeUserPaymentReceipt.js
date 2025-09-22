"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeeUserPaymentReceipt = void 0;
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
const FeeReceiptStatus_1 = require("./FeeReceiptStatus");
// Customer receipt. Indexed owner-first, look up payments by user.
class FeeUserPaymentReceipt extends ChainObject_1.ChainObject {
}
exports.FeeUserPaymentReceipt = FeeUserPaymentReceipt;
FeeUserPaymentReceipt.INDEX_KEY = "GCUR"; // UR = User Receipt
tslib_1.__decorate([
    (0, utils_1.ChainKey)({ position: 0 }),
    (0, validators_1.IsUserAlias)(),
    tslib_1.__metadata("design:type", String)
], FeeUserPaymentReceipt.prototype, "paidByUser", void 0);
tslib_1.__decorate([
    (0, utils_1.ChainKey)({ position: 1 }),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], FeeUserPaymentReceipt.prototype, "year", void 0);
tslib_1.__decorate([
    (0, utils_1.ChainKey)({ position: 2 }),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], FeeUserPaymentReceipt.prototype, "month", void 0);
tslib_1.__decorate([
    (0, utils_1.ChainKey)({ position: 3 }),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], FeeUserPaymentReceipt.prototype, "day", void 0);
tslib_1.__decorate([
    (0, utils_1.ChainKey)({ position: 4 }),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], FeeUserPaymentReceipt.prototype, "txId", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, validators_1.BigNumberIsNotNegative)(),
    (0, validators_1.BigNumberProperty)(),
    tslib_1.__metadata("design:type", bignumber_js_1.BigNumber)
], FeeUserPaymentReceipt.prototype, "quantity", void 0);
tslib_1.__decorate([
    (0, validators_1.EnumProperty)(FeeReceiptStatus_1.FeeReceiptStatus),
    tslib_1.__metadata("design:type", Number)
], FeeUserPaymentReceipt.prototype, "status", void 0);
//# sourceMappingURL=FeeUserPaymentReceipt.js.map