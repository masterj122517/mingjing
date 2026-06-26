use ring::aead::{Aad, BoundKey, LessSafeKey, Nonce, UnboundKey, AES_256_GCM, NONCE_LEN};
use ring::digest::{digest, SHA256};
use ring::rand::{SecureRandom, SystemRandom};
use std::fs;
use std::path::PathBuf;

fn passkey_path(app_dir: &PathBuf) -> PathBuf {
    app_dir.join("passkey")
}

fn derive_key(password: &str) -> [u8; 32] {
    let d = digest(&SHA256, password.as_bytes());
    let mut key = [0u8; 32];
    key.copy_from_slice(d.as_ref());
    key
}

pub fn has_master_password(app_dir: &PathBuf) -> bool {
    passkey_path(app_dir).exists()
}

pub fn set_master_password(app_dir: &PathBuf, password: &str) -> Result<(), String> {
    let key_hash = derive_key(password);
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &key_hash);
    fs::write(passkey_path(app_dir), encoded).map_err(|e| e.to_string())
}

pub fn verify_master_password(app_dir: &PathBuf, password: &str) -> Result<bool, String> {
    let stored = fs::read_to_string(passkey_path(app_dir)).map_err(|e| e.to_string())?;
    let stored_hash = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &stored)
        .map_err(|e| e.to_string())?;
    let input_hash = derive_key(password);
    Ok(stored_hash.len() == 32 && stored_hash == input_hash)
}

pub fn encrypt_api_key(
    app_dir: &PathBuf,
    password: &str,
    plaintext: &str,
) -> Result<String, String> {
    let key_bytes = derive_key(password);
    let unbound =
        UnboundKey::new(&AES_256_GCM, &key_bytes).map_err(|e| format!("key error: {e}"))?;
    let mut nonce_bytes = [0u8; NONCE_LEN];
    SystemRandom::new()
        .fill(&mut nonce_bytes)
        .map_err(|e| format!("nonce error: {e}"))?;
    let nonce = Nonce::assume_unique_for_key(nonce_bytes);
    let mut key = LessSafeKey::new(unbound);
    let mut in_out = plaintext.as_bytes().to_vec();
    key.seal_in_place_append_tag(nonce, Aad::empty(), &mut in_out)
        .map_err(|e| format!("seal error: {e}"))?;
    let mut result = Vec::new();
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&in_out);
    Ok(base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &result,
    ))
}

pub fn decrypt_api_key(
    app_dir: &PathBuf,
    password: &str,
    encrypted: &str,
) -> Result<String, String> {
    let key_bytes = derive_key(password);
    let data = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encrypted)
        .map_err(|e| e.to_string())?;
    if data.len() < NONCE_LEN + 16 {
        return Err("invalid encrypted data".into());
    }
    let (nonce_bytes, ciphertext) = data.split_at(NONCE_LEN);
    let unbound =
        UnboundKey::new(&AES_256_GCM, &key_bytes).map_err(|e| format!("key error: {e}"))?;
    let nonce = Nonce::assume_unique_for_key(nonce_bytes.try_into().map_err(|_| "bad nonce")?);
    let mut key = LessSafeKey::new(unbound);
    let mut in_out = ciphertext.to_vec();
    key.open_in_place(nonce, Aad::empty(), &mut in_out)
        .map_err(|e| format!("decrypt error: {e}"))?;
    String::from_utf8(in_out).map_err(|e| e.to_string())
}

pub fn re_encrypt_all(
    app_dir: &PathBuf,
    old_password: &str,
    new_password: &str,
    encrypted_keys: &[String],
) -> Result<Vec<String>, String> {
    encrypted_keys
        .iter()
        .map(|ek| {
            let plain = decrypt_api_key(app_dir, old_password, ek)?;
            encrypt_api_key(app_dir, new_password, &plain)
        })
        .collect()
}
