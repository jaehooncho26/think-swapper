"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
const error_1 = require("./error");
it("should create proper error keys", async () => {
    // Given
    class PkNotFoundError extends error_1.NotFoundError {
    }
    class CannotParseX509Error extends error_1.ForbiddenError {
    }
    class CAError extends error_1.ForbiddenError {
    }
    // When
    const defaultError = new error_1.DefaultError("message1");
    const child1Error = new PkNotFoundError("message2", { a: 1 });
    const child2Error = new PkNotFoundError("message3", "CUSTOM-KEY-ERROR");
    const child3Error = new CannotParseX509Error("message4");
    const child4Error = new CAError("message5");
    // Then
    expect(defaultError.key).toEqual("DEFAULT");
    expect(child1Error.key).toEqual("PK_NOT_FOUND");
    expect(child2Error.key).toEqual("CUSTOM_KEY_ERROR");
    expect(child3Error.key).toEqual("CANNOT_PARSE_X_509");
    expect(child4Error.key).toEqual("CA");
});
it("should match by class or error code", () => {
    // Given
    class PkNotFoundError extends error_1.NotFoundError {
    }
    // When
    const e1 = new PkNotFoundError("bb");
    const e2 = { message: "aa", code: error_1.ErrorCode.FORBIDDEN };
    const e3 = new Error("aa");
    // Then
    expect(error_1.ChainError.matches(e1, error_1.ErrorCode.NOT_FOUND)).toEqual(true);
    expect(error_1.ChainError.matches(e1, error_1.ErrorCode.FORBIDDEN)).toEqual(false);
    expect(error_1.ChainError.matches(e1, PkNotFoundError)).toEqual(true);
    expect(error_1.ChainError.matches(e1, error_1.NotFoundError)).toEqual(false);
    expect(error_1.ChainError.matches(e2, error_1.ErrorCode.FORBIDDEN)).toEqual(false);
    expect(error_1.ChainError.matches(e3, error_1.DefaultError)).toEqual(false);
    expect(error_1.ChainError.matches(error_1.ChainError.from(e3), error_1.DefaultError)).toEqual(true);
});
it("should map to a different error", () => {
    // Given
    class PkNotFoundError extends error_1.NotFoundError {
    }
    const error = new error_1.NotFoundError("abc not found", { key: "abc" });
    // When
    const mapped1 = error.map(error_1.NotFoundError, (e) => new PkNotFoundError(e.message, e.payload));
    const mapped2 = error.map(error_1.ErrorCode.NOT_FOUND, (e) => new PkNotFoundError(e.message, e.payload));
    const notMapped = error.map(error_1.DefaultError, (e) => new PkNotFoundError(e.message, e.payload));
    // Then
    expect(mapped1.message).toEqual(error.message);
    expect(mapped1.payload).toEqual(error.payload);
    expect(error_1.ChainError.matches(error, PkNotFoundError)).toEqual(false);
    expect(mapped2.message).toEqual(error.message);
    expect(mapped2.payload).toEqual(error.payload);
    expect(error_1.ChainError.matches(error, PkNotFoundError)).toEqual(false);
    expect(notMapped.message).toEqual(error.message);
    expect(notMapped.payload).toEqual(error.payload);
    expect(error_1.ChainError.matches(notMapped, PkNotFoundError)).toEqual(false);
});
it("should take error payload", () => {
    // When
    const error1 = new error_1.NotFoundError("abc not found", { key: "abc" });
    const error2 = new error_1.NotFoundError("abc not found", "ABC_NOT_FOUND", { key: "abc" });
    // Then
    expect(error1.payload).toEqual({ key: "abc" });
    expect(error1.key).toEqual("NOT_FOUND");
    expect(error2.payload).toEqual({ key: "abc" });
    expect(error2.key).toEqual("ABC_NOT_FOUND");
});
//# sourceMappingURL=error.spec.js.map