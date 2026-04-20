import pytest
from cryptography.fernet import Fernet


def _patch_key(monkeypatch):
    key = Fernet.generate_key().decode()
    import config
    monkeypatch.setattr(config.settings, "ENCRYPTION_KEY", key)
    monkeypatch.setattr(config.settings, "ENCRYPTION_KEY_V1", "")
    return key


def test_encrypt_decrypt_roundtrip(monkeypatch):
    _patch_key(monkeypatch)
    import importlib, crypto
    importlib.reload(crypto)
    plaintext = "Paciente refiere ansiedad severa."
    ciphertext = crypto.encrypt(plaintext)
    assert ciphertext.startswith("v1:")
    assert crypto.decrypt(ciphertext) == plaintext


def test_encrypt_produces_different_ciphertexts(monkeypatch):
    _patch_key(monkeypatch)
    import importlib, crypto
    importlib.reload(crypto)
    c1 = crypto.encrypt("mismo texto")
    c2 = crypto.encrypt("mismo texto")
    assert c1 != c2  # Fernet uses random IV


def test_decrypt_if_set_none_returns_none(monkeypatch):
    _patch_key(monkeypatch)
    import importlib, crypto
    importlib.reload(crypto)
    assert crypto.decrypt_if_set(None) is None


def test_decrypt_if_set_legacy_plain_text(monkeypatch):
    _patch_key(monkeypatch)
    import importlib, crypto
    importlib.reload(crypto)
    assert crypto.decrypt_if_set("texto plano sin cifrar") == "texto plano sin cifrar"


def test_encrypt_if_set_none_returns_none(monkeypatch):
    _patch_key(monkeypatch)
    import importlib, crypto
    importlib.reload(crypto)
    assert crypto.encrypt_if_set(None) is None


def test_encrypt_if_set_encrypts_string(monkeypatch):
    _patch_key(monkeypatch)
    import importlib, crypto
    importlib.reload(crypto)
    result = crypto.encrypt_if_set("valor")
    assert result is not None and result.startswith("v1:")


def test_validate_key_raises_on_invalid_format(monkeypatch):
    import config
    monkeypatch.setattr(config.settings, "ENCRYPTION_KEY", "not_a_valid_fernet_key_at_all")
    import importlib, crypto
    importlib.reload(crypto)
    with pytest.raises(SystemExit):
        crypto.validate_key()


def test_validate_key_raises_on_empty(monkeypatch):
    import config
    monkeypatch.setattr(config.settings, "ENCRYPTION_KEY", "")
    import importlib, crypto
    importlib.reload(crypto)
    with pytest.raises(SystemExit):
        crypto.validate_key()


def test_validate_key_passes_on_valid(monkeypatch):
    _patch_key(monkeypatch)
    import importlib, crypto
    importlib.reload(crypto)
    crypto.validate_key()  # Should not raise


def test_decrypt_unknown_prefix_raises(monkeypatch):
    _patch_key(monkeypatch)
    import importlib, crypto
    importlib.reload(crypto)
    with pytest.raises(crypto.DecryptionError):
        crypto.decrypt("v99:invalido")
