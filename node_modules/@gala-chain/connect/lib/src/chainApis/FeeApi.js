"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeeApi = void 0;
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
const api_1 = require("@gala-chain/api");
const types_1 = require("../types");
const GalaChainBaseApi_1 = require("./GalaChainBaseApi");
class FeeApi extends GalaChainBaseApi_1.GalaChainBaseApi {
    constructor(chainCodeUrl, connection) {
        super(chainCodeUrl, connection);
    }
    AuthorizeFee(dto) {
        return this.connection.submit({
            method: "AuthorizeFee",
            payload: dto,
            sign: true,
            url: this.chainCodeUrl,
            requestConstructor: api_1.FeeAuthorizationDto,
            responseConstructor: types_1.FetchFeeAuthorizationsResponse
        });
    }
    FetchFeeAutorizations(dto) {
        return this.connection.submit({
            method: "DryRun",
            payload: dto,
            sign: false,
            url: this.chainCodeUrl,
            requestConstructor: api_1.FetchFeeAuthorizationsDto,
            responseConstructor: types_1.FetchFeeAuthorizationsResponse
        });
    }
    FetchFeeProperties(dto) {
        return this.connection.submit({
            method: "FetchFeeProperties",
            payload: dto,
            sign: true,
            url: this.chainCodeUrl,
            requestConstructor: api_1.FetchFeePropertiesDto,
            responseConstructor: types_1.FeeProperties
        });
    }
    SetFeeProperties(dto) {
        return this.connection.submit({
            method: "FetchFeeProperties",
            payload: dto,
            sign: false,
            url: this.chainCodeUrl,
            requestConstructor: api_1.FeePropertiesDto,
            responseConstructor: types_1.FeeProperties
        });
    }
}
exports.FeeApi = FeeApi;
//# sourceMappingURL=FeeApi.js.map