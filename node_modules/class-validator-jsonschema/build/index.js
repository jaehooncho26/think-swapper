"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.targetConstructorToSchema = exports.validationMetadataArrayToSchemas = exports.validationMetadatasToSchemas = exports.JSONSchema = void 0;
const tslib_1 = require("tslib");
const cv = tslib_1.__importStar(require("class-validator"));
const lodash_groupby_1 = tslib_1.__importDefault(require("lodash.groupby"));
const lodash_merge_1 = tslib_1.__importDefault(require("lodash.merge"));
const decorators_1 = require("./decorators");
const defaultConverters_1 = require("./defaultConverters");
const options_1 = require("./options");
var decorators_2 = require("./decorators");
Object.defineProperty(exports, "JSONSchema", { enumerable: true, get: function () { return decorators_2.JSONSchema; } });
function validationMetadatasToSchemas(userOptions) {
    const options = Object.assign(Object.assign({}, options_1.defaultOptions), userOptions);
    const metadatas = getMetadatasFromStorage(options.classValidatorMetadataStorage);
    return validationMetadataArrayToSchemas(metadatas, userOptions);
}
exports.validationMetadatasToSchemas = validationMetadatasToSchemas;
function validationMetadataArrayToSchemas(metadatas, userOptions) {
    const options = Object.assign(Object.assign({}, options_1.defaultOptions), userOptions);
    const schemas = {};
    Object.entries((0, lodash_groupby_1.default)(metadatas, ({ target }) => {
        var _a;
        return (_a = target[options.schemaNameField]) !== null && _a !== void 0 ? _a : target.name;
    })).forEach(([key, ownMetas]) => {
        const target = ownMetas[0].target;
        const metas = ownMetas
            .concat(getInheritedMetadatas(target, metadatas))
            .filter((propMeta) => !(isExcluded(propMeta, options) ||
            isExcluded(Object.assign(Object.assign({}, propMeta), { target }), options)));
        const properties = {};
        Object.entries((0, lodash_groupby_1.default)(metas, 'propertyName')).forEach(([propName, propMetas]) => {
            const schema = applyConverters(propMetas, options);
            properties[propName] = applyDecorators(schema, target, options, propName);
        });
        const definitionSchema = {
            properties,
            type: 'object',
        };
        const required = getRequiredPropNames(target, metas, options);
        if (required.length > 0) {
            definitionSchema.required = required;
        }
        schemas[key] = applyDecorators(definitionSchema, target, options, target.name);
    });
    return schemas;
}
exports.validationMetadataArrayToSchemas = validationMetadataArrayToSchemas;
function getTargetConstructorSchema(schemas, targetConstructor) {
    if (!targetConstructor.name) {
        return {};
    }
    else if (schemas[targetConstructor.name]) {
        return schemas[targetConstructor.name];
    }
    else {
        return getTargetConstructorSchema(schemas, Object.getPrototypeOf(targetConstructor));
    }
}
function targetConstructorToSchema(targetConstructor, userOptions) {
    const options = Object.assign(Object.assign({}, options_1.defaultOptions), userOptions);
    const storage = options.classValidatorMetadataStorage;
    let metadatas = storage.getTargetValidationMetadatas(targetConstructor, '', true, false);
    metadatas = populateMetadatasWithConstraints(storage, metadatas);
    const schemas = validationMetadataArrayToSchemas(metadatas, userOptions);
    return getTargetConstructorSchema(schemas, targetConstructor);
}
exports.targetConstructorToSchema = targetConstructorToSchema;
function getMetadatasFromStorage(storage) {
    const metadatas = [];
    for (const value of storage.validationMetadatas) {
        metadatas.push(...populateMetadatasWithConstraints(storage, value[1]));
    }
    return metadatas;
}
function populateMetadatasWithConstraints(storage, metadatas) {
    return metadatas.map((meta) => {
        if (meta.constraintCls) {
            const constraint = storage.getTargetValidatorConstraints(meta.constraintCls);
            if (constraint.length > 0) {
                return Object.assign(Object.assign({}, meta), { type: constraint[0].name });
            }
        }
        return Object.assign({}, meta);
    });
}
function getInheritedMetadatas(target, metadatas) {
    return metadatas.filter((d) => d.target instanceof Function &&
        target.prototype instanceof d.target &&
        !metadatas.find((m) => m.propertyName === d.propertyName &&
            m.target === target &&
            m.type === d.type));
}
function applyConverters(propertyMetadatas, options) {
    const converters = Object.assign(Object.assign({}, defaultConverters_1.defaultConverters), options.additionalConverters);
    const convert = (meta) => {
        var _a;
        const typeMeta = (_a = options.classTransformerMetadataStorage) === null || _a === void 0 ? void 0 : _a.findTypeMetadata(meta.target, meta.propertyName);
        const isMap = typeMeta &&
            typeMeta.reflectedType &&
            new typeMeta.reflectedType() instanceof Map;
        const converter = converters[meta.type] || converters[cv.ValidationTypes.CUSTOM_VALIDATION];
        const items = typeof converter === 'function' ? converter(meta, options) : converter;
        if (meta.each && isMap) {
            return {
                additionalProperties: Object.assign({}, items),
                type: 'object',
            };
        }
        return meta.each ? { items, type: 'array' } : items;
    };
    return (0, lodash_merge_1.default)({}, ...propertyMetadatas.map(convert));
}
function isExcluded(propertyMetadata, options) {
    var _a;
    return !!((_a = options.classTransformerMetadataStorage) === null || _a === void 0 ? void 0 : _a.findExcludeMetadata(propertyMetadata.target, propertyMetadata.propertyName));
}
function applyDecorators(schema, target, options, propertyName) {
    const additionalSchema = (0, decorators_1.getMetadataSchema)(target.prototype, propertyName);
    return typeof additionalSchema === 'function'
        ? additionalSchema(schema, options)
        : (0, lodash_merge_1.default)({}, schema, additionalSchema);
}
function getRequiredPropNames(target, metadatas, options) {
    function isDefined(metas) {
        return (metas && metas.some(({ type }) => type === cv.ValidationTypes.IS_DEFINED));
    }
    function isOptional(metas) {
        return (metas &&
            metas.some(({ type }) => [cv.ValidationTypes.CONDITIONAL_VALIDATION, cv.IS_EMPTY].includes(type)));
    }
    return Object.entries((0, lodash_groupby_1.default)(metadatas, (m) => m.propertyName))
        .filter(([_, metas]) => {
        const own = metas.filter((m) => m.target === target);
        const inherited = metas.filter((m) => m.target !== target);
        return options.skipMissingProperties
            ? isDefined(own) || (!isOptional(own) && isDefined(inherited))
            : !(isOptional(own) || isOptional(inherited));
    })
        .map(([name]) => name);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7OztBQUNBLDREQUFxQztBQUVyQyw0RUFBcUM7QUFDckMsd0VBQWlDO0FBR2pDLDZDQUFnRDtBQUNoRCwyREFBdUQ7QUFDdkQsdUNBQW9EO0FBRXBELDJDQUF5QztBQUFoQyx3R0FBQSxVQUFVLE9BQUE7QUFTbkIsU0FBZ0IsNEJBQTRCLENBQzFDLFdBQStCO0lBRS9CLE1BQU0sT0FBTyxtQ0FDUix3QkFBYyxHQUNkLFdBQVcsQ0FDZixDQUFBO0lBRUQsTUFBTSxTQUFTLEdBQUcsdUJBQXVCLENBQ3ZDLE9BQU8sQ0FBQyw2QkFBNkIsQ0FDdEMsQ0FBQTtJQUVELE9BQU8sZ0NBQWdDLENBQUMsU0FBUyxFQUFFLFdBQVcsQ0FBQyxDQUFBO0FBQ2pFLENBQUM7QUFiRCxvRUFhQztBQUtELFNBQWdCLGdDQUFnQyxDQUM5QyxTQUErQixFQUMvQixXQUErQjtJQUUvQixNQUFNLE9BQU8sbUNBQ1Isd0JBQWMsR0FDZCxXQUFXLENBQ2YsQ0FBQTtJQUVELE1BQU0sT0FBTyxHQUFvQyxFQUFFLENBQUE7SUFDbkQsTUFBTSxDQUFDLE9BQU8sQ0FDWixJQUFBLHdCQUFRLEVBQ04sU0FBUyxFQUNULENBQUMsRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFFOztRQUNiLE9BQUEsTUFBQSxNQUFNLENBQUMsT0FBTyxDQUFDLGVBQXNDLENBQUMsbUNBQ3JELE1BQW1CLENBQUMsSUFBSSxDQUFBO0tBQUEsQ0FDNUIsQ0FDRixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLFFBQVEsQ0FBQyxFQUFFLEVBQUU7UUFDNUIsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQWtCLENBQUE7UUFDN0MsTUFBTSxLQUFLLEdBQUcsUUFBUTthQUNuQixNQUFNLENBQUMscUJBQXFCLENBQUMsTUFBTSxFQUFFLFNBQVMs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LENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLE1BQU0sQ0FBQyxDQUFBO1FBQ3BELE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLEtBQUssTUFBTSxDQUFDLENBQUE7UUFDMUQsT0FBTyxPQUFPLENBQUMscUJBQXFCO1lBQ2xDLENBQUMsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDOUQsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUE7SUFDakQsQ0FBQyxDQUFDO1NBQ0QsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUE7QUFDMUIsQ0FBQyJ9