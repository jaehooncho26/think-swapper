"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPayloadToSign = void 0;
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
const typed_data_1 = require("../../ethers/hash/typed-data");
const serialize_1 = tslib_1.__importDefault(require("../serialize"));
// Type guard to check if an object is EIP712Object
function isEIP712Object(obj) {
    return obj && typeof obj === "object" && "domain" in obj && "types" in obj;
}
function getEIP712PayloadToSign(obj) {
    return typed_data_1.TypedDataEncoder.encode(obj.domain, obj.types, obj);
}
function getPayloadToSign(obj) {
    if (isEIP712Object(obj)) {
        return getEIP712PayloadToSign(obj);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { signature, trace, ...plain } = (0, class_transformer_1.instanceToPlain)(obj);
    return (0, serialize_1.default)(plain);
}
exports.getPayloadToSign = getPayloadToSign;
//# sourceMappingURL=getPayloadToSign.js.map