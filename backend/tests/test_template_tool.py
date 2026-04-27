from agent.template_tool import build_json_schema_for_field, build_fill_tool

def test_text_field():
    schema = build_json_schema_for_field({"type": "text", "label": "Estado", "options": [], "guiding_question": ""})
    assert schema["type"] == "string"

def test_scale_field():
    schema = build_json_schema_for_field({"type": "scale", "label": "Intensidad", "options": [], "guiding_question": ""})
    assert schema["type"] == "integer"
    assert schema["minimum"] == 1
    assert schema["maximum"] == 10

def test_checkbox_field():
    schema = build_json_schema_for_field({"type": "checkbox", "label": "Conductas", "options": ["Llanto", "Ideación"], "guiding_question": ""})
    assert schema["type"] == "array"
    assert schema["items"]["enum"] == ["Llanto", "Ideación"]

def test_list_field():
    schema = build_json_schema_for_field({"type": "list", "label": "Técnica", "options": ["CBT", "DBT"], "guiding_question": ""})
    assert schema["type"] == "string"
    assert schema["enum"] == ["CBT", "DBT"]

def test_date_field():
    schema = build_json_schema_for_field({"type": "date", "label": "Fecha", "options": [], "guiding_question": ""})
    assert schema["type"] == "string"
    assert schema["format"] == "date"

def test_build_fill_tool_no_required():
    """Fields must NOT be required so Claude can omit them when data is absent."""
    fields = [
        {"id": "estado_animo", "label": "Estado de ánimo", "type": "text", "order": 1},
        {"id": "fecha_sesion", "label": "Fecha", "type": "date", "order": 2},
    ]
    tool = build_fill_tool(fields)
    assert "required" not in tool["input_schema"], (
        "Fields must not be required — omission is correct when data is missing"
    )

def test_build_fill_tool_description_forbids_unknown():
    """Tool description must instruct Claude to omit rather than use placeholders."""
    fields = [{"id": "x", "label": "X", "type": "text", "order": 1}]
    tool = build_fill_tool(fields)
    description = tool["description"].lower()
    # Must tell Claude to omit missing fields (not fill with placeholders)
    assert "omit" in description or "omite" in description or "omitir" in description
    # Must mention 'never' or 'nunca' in relation to placeholders
    assert "never" in description or "nunca" in description
