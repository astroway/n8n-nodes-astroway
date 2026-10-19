import type { INodePropertyOptions, ResourceMapperField } from 'n8n-workflow';
import type { AstrowayRoute } from './operations.generated';

export const SPEC_URL = 'https://api.astroway.info/v1/openapi.json';

// A query parameter that shares its name with a body property gets this prefix,
// so both can be filled and the node knows where each one goes.
export const QUERY_PREFIX = 'query:';

type Schema = {
	$ref?: string;
	type?: string | string[];
	enum?: unknown[];
	properties?: Record<string, Schema>;
	required?: string[];
	allOf?: Schema[];
	anyOf?: Schema[];
	oneOf?: Schema[];
	items?: Schema;
	default?: unknown;
	nullable?: boolean;
};
type Parameter = { $ref?: string; in?: string; name?: string; required?: boolean; schema?: Schema };
type Spec = {
	components?: Record<string, Record<string, unknown>>;
	paths: Record<string, Record<string, { parameters?: Parameter[]; requestBody?: unknown }>>;
};

function deref<T extends { $ref?: string }>(spec: Spec, node: T | undefined): T | undefined {
	let current: unknown = node;
	for (let i = 0; i < 10 && current && (current as { $ref?: string }).$ref; i++) {
		const parts = (current as { $ref: string }).$ref.replace('#/', '').split('/');
		current = parts.reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], spec);
	}
	return current as T | undefined;
}

/** Top-level body properties, with allOf merged and anyOf/oneOf unioned
 *  (a property is required only when every branch requires it). */
export function bodyProperties(
	spec: Spec,
	raw: Schema | undefined,
): { properties: Record<string, Schema>; required: Set<string> } {
	const schema = deref(spec, raw);
	if (!schema) return { properties: {}, required: new Set() };
	const properties: Record<string, Schema> = {};
	let required = new Set<string>(schema.required ?? []);
	for (const [name, prop] of Object.entries(schema.properties ?? {})) properties[name] = deref(spec, prop) ?? {};
	for (const part of schema.allOf ?? []) {
		const inner = bodyProperties(spec, part);
		Object.assign(properties, inner.properties);
		for (const r of inner.required) required.add(r);
	}
	const branches = schema.anyOf ?? schema.oneOf;
	if (branches?.length) {
		let common: string[] | undefined;
		for (const branch of branches) {
			const inner = bodyProperties(spec, branch);
			for (const [name, prop] of Object.entries(inner.properties)) properties[name] ??= prop;
			common = common === undefined ? [...inner.required] : common.filter((r) => inner.required.has(r));
		}
		required = new Set([...required, ...(common ?? [])]);
	}
	return { properties, required };
}

function fieldType(schema: Schema): Pick<ResourceMapperField, 'type' | 'options'> {
	if (schema.enum?.length) {
		const options: INodePropertyOptions[] = schema.enum.map((v) => ({
			name: String(v),
			value: v as string | number | boolean,
		}));
		return { type: 'options', options };
	}
	const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type;
	if (type === 'integer' || type === 'number') return { type: 'number' };
	if (type === 'boolean') return { type: 'boolean' };
	if (type === 'array') return { type: 'array' };
	if (type === 'object' || schema.properties || schema.allOf || schema.anyOf || schema.oneOf) return { type: 'object' };
	return { type: 'string' };
}

function field(id: string, displayName: string, schema: Schema, required: boolean): ResourceMapperField {
	return {
		id,
		displayName,
		required,
		defaultMatch: false,
		canBeUsedToMatch: false,
		display: true,
		...fieldType(schema),
	};
}

/** Every field the operation accepts: path parameters, body properties, then query parameters. */
export function operationFields(spec: Spec, op: AstrowayRoute): ResourceMapperField[] {
	const item = spec.paths[op.path];
	const raw = item?.[op.method.toLowerCase()];
	if (!item || !raw) return [];
	const params = [...(((item as { parameters?: Parameter[] }).parameters) ?? []), ...(raw.parameters ?? [])]
		.map((p) => deref(spec, p))
		.filter((p): p is Parameter => Boolean(p?.name));

	const fields: ResourceMapperField[] = [];
	for (const p of params.filter((x) => x.in === 'path')) {
		fields.push(field(p.name!, p.name!, deref(spec, p.schema) ?? {}, true));
	}

	const body = deref(spec, raw.requestBody as { $ref?: string; content?: Record<string, { schema?: Schema }> });
	const json = body?.content?.['application/json']?.schema;
	const { properties, required } = bodyProperties(spec, json);
	for (const [name, schema] of Object.entries(properties)) {
		fields.push(field(name, name, schema, required.has(name)));
	}

	for (const p of params.filter((x) => x.in === 'query')) {
		const clash = p.name! in properties;
		fields.push(
			field(clash ? `${QUERY_PREFIX}${p.name}` : p.name!, clash ? `${p.name} (query)` : p.name!, deref(spec, p.schema) ?? {}, Boolean(p.required)),
		);
	}
	return fields;
}
