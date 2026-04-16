package com.gemmaremember.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.nio.ByteBuffer

class MemoryDB(context: Context) :
    SQLiteOpenHelper(context, "memory.db", null, 1) {

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
    }

    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) {
        db.execSQL("DROP TABLE IF EXISTS embeddings")
        db.execSQL("DROP TABLE IF EXISTS profiles")
        onCreate(db)
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
}
