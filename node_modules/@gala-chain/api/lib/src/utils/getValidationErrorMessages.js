"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getValidationErrorMessages = void 0;
function getValidationErrorMessages(validationErrors) {
    return validationErrors
        .map((e) => {
        var _a;
        const constraints = (_a = e.constraints) !== null && _a !== void 0 ? _a : {};
        const constraintsKeys = Object.keys(constraints).sort();
        const details = constraintsKeys.map((k) => `${k}: ${constraints[k]}`);
        if (e.children) {
            const childDetails = getValidationErrorMessages(e.children);
            details.push(...childDetails);
        }
        return details;
    })
        .flat();
}
exports.getValidationErrorMessages = getValidationErrorMessages;
//# sourceMappingURL=getValidationErrorMessages.js.map