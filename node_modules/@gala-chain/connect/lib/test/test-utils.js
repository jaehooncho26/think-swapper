"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRandomHash = exports.mockFetch = void 0;
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
const mockFetch = (body, headers, ok = true) => {
    global.fetch = jest.fn((_url, _options) => Promise.resolve({
        ok,
        json: () => Promise.resolve(body),
        headers: {
            get: (key) => headers === null || headers === void 0 ? void 0 : headers[key]
        }
    }));
};
exports.mockFetch = mockFetch;
const createRandomHash = () => {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
};
exports.createRandomHash = createRandomHash;
//# sourceMappingURL=test-utils.js.map