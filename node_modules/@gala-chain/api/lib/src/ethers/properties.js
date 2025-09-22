"use strict";
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 *  Property helper functions.
 *
 *  @_subsection api/utils:Properties  [about-properties]
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defineProperties = void 0;
function checkType(value, type, name) {
    const types = type.split("|").map((t) => t.trim());
    for (let i = 0; i < types.length; i++) {
        switch (type) {
            case "any":
                return;
            case "bigint":
            case "boolean":
            case "number":
            case "string":
                if (typeof value === type) {
                    return;
                }
        }
    }
    const error = new Error(`invalid value for type ${type}`);
    error.code = "INVALID_ARGUMENT";
    error.argument = `value.${name}`;
    error.value = value;
    throw error;
}
/**
 *  Assigns the %%values%% to %%target%% as read-only values.
 *
 *  It %%types%% is specified, the values are checked.
 */
function defineProperties(target, values, types) {
    for (const key in values) {
        const value = values[key];
        const type = types ? types[key] : null;
        if (type) {
            checkType(value, type, key);
        }
        Object.defineProperty(target, key, { enumerable: true, value, writable: false });
    }
}
exports.defineProperties = defineProperties;
//# sourceMappingURL=properties.js.map