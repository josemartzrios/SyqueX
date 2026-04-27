from agent.template_tool import build_json_schema_for_field

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
