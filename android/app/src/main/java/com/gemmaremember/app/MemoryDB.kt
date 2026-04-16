package com.gemmaremember.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.nio.ByteBuffer

class MemoryDB(context: Context) :
    SQLiteOpenHelper(context, "memory.db", null, 2) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                relationship TEXT,
                story TEXT,
                photo_path TEXT,
                caption TEXT
            )
        """)
        db.execSQL("""
            CREATE TABLE embeddings (
                id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL,
                type TEXT NOT NULL,
                embedding BLOB NOT NULL,
                FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
            )
        """)
        db.execSQL("""
            CREATE TABLE reminders (
                id TEXT PRIMARY KEY,
                text TEXT NOT NULL,
                date TEXT,
                time TEXT,
                recurring TEXT,
                category TEXT,
                active INTEGER DEFAULT 1
            )
        """)
    }

    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) {
        if (old < 2) {
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS reminders (
                    id TEXT PRIMARY KEY,
                    text TEXT NOT NULL,
                    date TEXT,
                    time TEXT,
                    recurring TEXT,
                    category TEXT,
                    active INTEGER DEFAULT 1
                )
            """)
        }
    }

    override fun onConfigure(db: SQLiteDatabase) {
        db.setForeignKeyConstraintsEnabled(true)
    }

    fun addProfile(id: String, name: String, relationship: String,
                   story: String, photoPath: String, caption: String) {
        writableDatabase.insertOrThrow("profiles", null, ContentValues().apply {
            put("id", id); put("name", name); put("relationship", relationship)
            put("story", story); put("photo_path", photoPath); put("caption", caption)
        })
    }

    fun getAllProfiles(): List<Map<String, String>> {
        val result = mutableListOf<Map<String, String>>()
        readableDatabase.query("profiles", null, null, null, null, null, null).use { c ->
            while (c.moveToNext()) {
                result.add(mapOf(
                    "id" to (c.getString(c.getColumnIndexOrThrow("id")) ?: ""),
                    "name" to (c.getString(c.getColumnIndexOrThrow("name")) ?: ""),
                    "relationship" to (c.getString(c.getColumnIndexOrThrow("relationship")) ?: ""),
                    "story" to (c.getString(c.getColumnIndexOrThrow("story")) ?: ""),
                    "photo_path" to (c.getString(c.getColumnIndexOrThrow("photo_path")) ?: ""),
                    "caption" to (c.getString(c.getColumnIndexOrThrow("caption")) ?: "")
                ))
            }
        }
        return result
    }

    fun deleteProfile(id: String) {
        writableDatabase.delete("profiles", "id = ?", arrayOf(id))
    }

    fun storeEmbedding(id: String, profileId: String, type: String, embedding: FloatArray) {
        val buf = ByteBuffer.allocate(embedding.size * 4)
        embedding.forEach { buf.putFloat(it) }
        writableDatabase.insertOrThrow("embeddings", null, ContentValues().apply {
            put("id", id); put("profile_id", profileId)
            put("type", type); put("embedding", buf.array())
        })
    }

    fun getAllEmbeddings(type: String): List<Pair<String, FloatArray>> {
        val result = mutableListOf<Pair<String, FloatArray>>()
        readableDatabase.query("embeddings", null,
            "type = ?", arrayOf(type), null, null, null).use { c ->
            while (c.moveToNext()) {
                val profileId = c.getString(c.getColumnIndexOrThrow("profile_id"))
                val blob = c.getBlob(c.getColumnIndexOrThrow("embedding"))
                val buf = ByteBuffer.wrap(blob)
                val floats = FloatArray(blob.size / 4) { buf.float }
                result.add(profileId to floats)
            }
        }
        return result
    }

    fun updateStory(id: String, appendText: String) {
        val current = readableDatabase.query("profiles", arrayOf("story"),
            "id = ?", arrayOf(id), null, null, null).use { c ->
            if (c.moveToFirst()) c.getString(0) ?: "" else ""
        }
        val updated = if (current.isBlank()) appendText else "$current\n$appendText"
        writableDatabase.update("profiles", ContentValues().apply {
            put("story", updated)
        }, "id = ?", arrayOf(id))
    }

    fun addReminder(id: String, text: String, date: String?, time: String?,
                    recurring: String?, category: String?) {
        writableDatabase.insertOrThrow("reminders", null, ContentValues().apply {
            put("id", id); put("text", text); put("date", date)
            put("time", time); put("recurring", recurring)
            put("category", category); put("active", 1)
        })
    }

    fun getReminders(): List<Map<String, String?>> {
        val result = mutableListOf<Map<String, String?>>()
        readableDatabase.query("reminders", null,
            "active = ?", arrayOf("1"), null, null, "date ASC, time ASC").use { c ->
            while (c.moveToNext()) {
                result.add(mapOf(
                    "id" to c.getString(c.getColumnIndexOrThrow("id")),
                    "text" to c.getString(c.getColumnIndexOrThrow("text")),
                    "date" to c.getString(c.getColumnIndexOrThrow("date")),
                    "time" to c.getString(c.getColumnIndexOrThrow("time")),
                    "recurring" to c.getString(c.getColumnIndexOrThrow("recurring")),
                    "category" to c.getString(c.getColumnIndexOrThrow("category"))
                ))
            }
        }
        return result
    }

    fun deleteReminder(id: String) {
        writableDatabase.delete("reminders", "id = ?", arrayOf(id))
    }
}
