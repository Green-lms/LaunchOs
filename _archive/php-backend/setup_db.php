<?php
/**
 * LaunchOS™ — Database Setup Script
 * Run once after deployment: php setup_db.php
 */

require_once __DIR__ . '/vendor/autoload.php';

// Load .env
if (file_exists(__DIR__ . '/.env')) {
    foreach (file(__DIR__ . '/.env') as $line) {
        $line = trim($line);
        if ($line && !str_starts_with($line, '#') && str_contains($line, '=')) {
            [$key, $val] = explode('=', $line, 2);
            putenv(trim($key) . '=' . trim($val));
        }
    }
}

$mongoUri = getenv('MONGO_URI') ?: 'mongodb://localhost:27017';
$dbName   = getenv('MONGO_DB')  ?: 'launchos';

echo "Connecting to MongoDB...\n";
$client = new MongoDB\Client($mongoUri);
$db     = $client->selectDatabase($dbName);

echo "Creating indexes...\n";

// Users
$db->users->createIndex(['email' => 1], ['unique' => true, 'name' => 'email_unique']);
$db->users->createIndex(['role' => 1], ['name' => 'role_idx']);
$db->users->createIndex(['createdAt' => -1], ['name' => 'created_idx']);

// Programmes
$db->programmes->createIndex(['userId' => 1], ['unique' => true, 'name' => 'userId_unique']);
$db->programmes->createIndex(['stage' => 1], ['name' => 'stage_idx']);

// Scripts
$db->scripts->createIndex(['userId' => 1, 'type' => 1], ['name' => 'user_type_idx']);
$db->scripts->createIndex(['userId' => 1], ['name' => 'user_idx']);

// Activity
$db->activity->createIndex(['userId' => 1, 'createdAt' => -1], ['name' => 'user_activity_idx']);
$db->activity->createIndex(['createdAt' => -1], ['name' => 'activity_date_idx']);
// Auto-delete activity older than 90 days
$db->activity->createIndex(['createdAt' => 1], ['expireAfterSeconds' => 7776000, 'name' => 'activity_ttl']);

// AI Usage
$db->ai_usage->createIndex(['userId' => 1, 'createdAt' => -1], ['name' => 'ai_usage_idx']);
// Auto-delete AI usage logs after 30 days
$db->ai_usage->createIndex(['createdAt' => 1], ['expireAfterSeconds' => 2592000, 'name' => 'ai_usage_ttl']);

echo "✅ All indexes created.\n";
echo "✅ Database setup complete.\n";
echo "\nNext step: Create your admin account:\n";
echo "  POST /api/admin/setup\n";
echo "  Body: {\"name\":\"Your Name\",\"email\":\"admin@yourdomain.com\",\"password\":\"YourPassword\"}\n";
