"""Builds Claude tool_use definitions from a psychologist's note template."""

def build_json_schema_for_field(field: dict) -> dict:
    ftype = field.get("type", "text")
    desc = field.get("guiding_question") or field.get("label", "")

    if ftype == "text":
        return {"type": "string", "description": desc}
    if ftype == "scale":
        return {"type": "integer", "minimum": 1, "maximum": 10, "description": desc}
    if ftype == "checkbox":
        options = field.get("options", [])
        return {"type": "array", "items": {"type": "string", "enum": options}, "description": desc}
    if ftype == "list":
        options = field.get("options", [])
        return {"type": "string", "enum": options, "description": desc}
    if ftype == "date":
        return {"type": "string", "format": "date", "description": desc}
    return {"type": "string", "description": desc}


def build_fill_tool(template_fields: list[dict]) -> dict:
    properties = {}
    for field in sorted(template_fields, key=lambda f: f.get("order", 0)):
        properties[field["id"]] = build_json_schema_for_field(field)
    return {
        "name": "fill_custom_note",
        "description": (
            "Fill all fields of the psychologist's clinical note from the session dictation. "
            "Extract information from the dictation for every field. "
            "If information for a field is not mentioned, make a reasonable clinical inference."
        ),
        "input_schema": {
            "type": "object",
            "properties": properties,
            "required": [f["id"] for f in template_fields],
        },
    }
