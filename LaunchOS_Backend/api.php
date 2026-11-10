<?php
/**
 * LaunchOS™ — Complete Backend API
 * Single-file PHP backend with MongoDB + JWT Auth
 * 
 * Requirements:
 * - PHP 8.1+
 * - MongoDB PHP Driver (pecl install mongodb)
 * - composer require mongodb/mongodb firebase/php-jwt
 * 
 * Deploy: Upload to any PHP host, point domain here
 */

declare(strict_types=1);

// ═══════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════
define('MONGO_URI',    getenv('MONGO_URI')    ?: 'mongodb://localhost:27017');
define('MONGO_DB',     getenv('MONGO_DB')     ?: 'launchos');
define('JWT_SECRET',   getenv('JWT_SECRET')   ?: 'CHANGE_THIS_IN_PRODUCTION_USE_32_CHAR_MIN');
define('JWT_EXPIRY',   (int)(getenv('JWT_EXPIRY')  ?: 86400 * 7)); // 7 days
define('CLAUDE_KEY',   getenv('CLAUDE_API_KEY') ?: '');
define('FRONTEND_URL', getenv('FRONTEND_URL') ?: '*');
define('APP_ENV',      getenv('APP_ENV')      ?: 'production');

// ═══════════════════════════════════════════
// CORS + HEADERS
// ═══════════════════════════════════════════
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: ' . FRONTEND_URL);
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ═══════════════════════════════════════════
// AUTOLOAD (if using Composer)
// ═══════════════════════════════════════════
$composerAutoload = __DIR__ . '/vendor/autoload.php';
if (file_exists($composerAutoload)) {
    require_once $composerAutoload;
}

// ═══════════════════════════════════════════
// DATABASE CONNECTION
// ═══════════════════════════════════════════
class DB {
    private static ?MongoDB\Client $client = null;
    private static ?MongoDB\Database $db = null;

    public static function get(): MongoDB\Database {
        if (self::$db === null) {
            self::$client = new MongoDB\Client(MONGO_URI);
            self::$db = self::$client->selectDatabase(MONGO_DB);
        }
        return self::$db;
    }

    public static function collection(string $name): MongoDB\Collection {
        return self::get()->selectCollection($name);
    }

    public static function id(string $id): MongoDB\BSON\ObjectId {
        return new MongoDB\BSON\ObjectId($id);
    }

    public static function now(): MongoDB\BSON\UTCDateTime {
        return new MongoDB\BSON\UTCDateTime(time() * 1000);
    }

    public static function toArray($doc): array {
        if ($doc === null) return [];
        $arr = iterator_to_array($doc) ?: [];
        if (isset($arr['_id'])) {
            $arr['_id'] = (string)$arr['_id'];
        }
        return $arr;
    }
}

// ═══════════════════════════════════════════
// JWT HELPER
// ═══════════════════════════════════════════
class JWT {
    public static function encode(array $payload): string {
        $payload['iat'] = time();
        $payload['exp'] = time() + JWT_EXPIRY;
        
        $header  = self::b64(json_encode(['alg'=>'HS256','typ'=>'JWT']));
        $body    = self::b64(json_encode($payload));
        $sig     = self::b64(hash_hmac('sha256', "$header.$body", JWT_SECRET, true));
        return "$header.$body.$sig";
    }

    public static function decode(string $token): ?array {
        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;
        
        [$header, $body, $sig] = $parts;
        $expected = self::b64(hash_hmac('sha256', "$header.$body", JWT_SECRET, true));
        if (!hash_equals($expected, $sig)) return null;
        
        $payload = json_decode(self::b64d($body), true);
        if (!$payload || $payload['exp'] < time()) return null;
        return $payload;
    }

    private static function b64(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
    private static function b64d(string $data): string {
        return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', 3 - (3 + strlen($data)) % 4));
    }
}

// ═══════════════════════════════════════════
// REQUEST / RESPONSE HELPERS
// ═══════════════════════════════════════════
class Request {
    public string $method;
    public string $path;
    public array  $body;
    public array  $query;
    public ?array $user = null;

    public function __construct() {
        $this->method = $_SERVER['REQUEST_METHOD'];
        $this->path   = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
        $this->path   = rtrim($this->path, '/') ?: '/';
        $this->query  = $_GET;
        $raw          = file_get_contents('php://input');
        $this->body   = json_decode($raw ?: '{}', true) ?: [];
    }

    public function get(string $key, mixed $default = null): mixed {
        return $this->body[$key] ?? $this->query[$key] ?? $default;
    }

    public function bearerToken(): ?string {
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (str_starts_with($auth, 'Bearer ')) {
            return substr($auth, 7);
        }
        return null;
    }
}

function json_ok(mixed $data, int $code = 200): never {
    http_response_code($code);
    echo json_encode(['success' => true, 'data' => $data]);
    exit;
}

function json_error(string $message, int $code = 400): never {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function require_auth(Request $req): array {
    $token = $req->bearerToken();
    if (!$token) json_error('Unauthorised — no token', 401);
    $payload = JWT::decode($token);
    if (!$payload) json_error('Unauthorised — invalid or expired token', 401);
    return $payload;
}

function validate(array $data, array $rules): void {
    foreach ($rules as $field => $rule) {
        if ($rule === 'required' && empty($data[$field])) {
            json_error("Field '$field' is required");
        }
        if (str_contains($rule, 'email') && !filter_var($data[$field] ?? '', FILTER_VALIDATE_EMAIL)) {
            json_error("Field '$field' must be a valid email");
        }
        if (str_contains($rule, 'min:')) {
            $min = (int)explode(':', $rule)[1];
            if (strlen($data[$field] ?? '') < $min) {
                json_error("Field '$field' must be at least $min characters");
            }
        }
    }
}

// ═══════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════
class Router {
    private array $routes = [];

    public function add(string $method, string $path, callable $handler): void {
        $this->routes[] = compact('method', 'path', 'handler');
    }

    public function dispatch(Request $req): void {
        foreach ($this->routes as $route) {
            if ($route['method'] !== $req->method && $route['method'] !== 'ANY') continue;
            $pattern = preg_replace('/\{(\w+)\}/', '(?P<$1>[^/]+)', $route['path']);
            if (preg_match("#^$pattern$#", $req->path, $matches)) {
                foreach ($matches as $k => $v) {
                    if (is_string($k)) $req->query[$k] = $v;
                }
                call_user_func($route['handler'], $req);
                return;
            }
        }
        json_error('Route not found', 404);
    }
}

// ═══════════════════════════════════════════
// AUTH CONTROLLER
// ═══════════════════════════════════════════
class AuthController {

    public static function register(Request $req): void {
        validate($req->body, [
            'name'     => 'required',
            'email'    => 'required|email',
            'password' => 'required|min:8',
        ]);

        $email = strtolower(trim($req->get('email')));
        $users = DB::collection('users');

        if ($users->findOne(['email' => $email])) {
            json_error('Email already registered');
        }

        $userId = $users->insertOne([
            'name'       => trim($req->get('name')),
            'email'      => $email,
            'password'   => password_hash($req->get('password'), PASSWORD_BCRYPT),
            'role'       => 'founder',
            'stage'      => 1,
            'createdAt'  => DB::now(),
            'updatedAt'  => DB::now(),
            'profile'    => [
                'businessType' => '',
                'country'      => 'India',
                'phone'        => '',
            ],
        ])->getInsertedId();

        // Create empty programme record
        DB::collection('programmes')->insertOne([
            'userId'    => (string)$userId,
            'stage'     => 1,
            'bmc'       => [],
            'bmcStep'   => 0,
            'offer'     => [],
            'assessments' => ['ns'=>null,'mindset'=>null,'skills'=>null,'market'=>null],
            'capital'   => [],
            'competitor'=> [],
            'mvp'       => [],
            'scripts'   => [],
            'createdAt' => DB::now(),
            'updatedAt' => DB::now(),
        ]);

        $token = JWT::encode(['userId' => (string)$userId, 'email' => $email, 'role' => 'founder']);
        json_ok(['token' => $token, 'user' => ['id' => (string)$userId, 'name' => $req->get('name'), 'email' => $email, 'role' => 'founder']], 201);
    }

    public static function login(Request $req): void {
        validate($req->body, ['email' => 'required|email', 'password' => 'required']);

        $email = strtolower(trim($req->get('email')));
        $user  = DB::collection('users')->findOne(['email' => $email]);

        if (!$user || !password_verify($req->get('password'), $user['password'])) {
            json_error('Invalid email or password', 401);
        }

        $userId = (string)$user['_id'];
        $token  = JWT::encode(['userId' => $userId, 'email' => $email, 'role' => $user['role'] ?? 'founder']);

        json_ok([
            'token' => $token,
            'user'  => [
                'id'    => $userId,
                'name'  => $user['name'],
                'email' => $user['email'],
                'role'  => $user['role'] ?? 'founder',
                'stage' => $user['stage'] ?? 1,
            ],
        ]);
    }

    public static function me(Request $req): void {
        $auth = require_auth($req);
        $user = DB::collection('users')->findOne(['_id' => DB::id($auth['userId'])]);
        if (!$user) json_error('User not found', 404);

        $arr = DB::toArray($user);
        unset($arr['password']);
        json_ok($arr);
    }

    public static function updateProfile(Request $req): void {
        $auth = require_auth($req);
        $allowed = ['name', 'profile'];
        $update  = [];
        foreach ($allowed as $field) {
            if (isset($req->body[$field])) $update[$field] = $req->body[$field];
        }
        $update['updatedAt'] = DB::now();

        DB::collection('users')->updateOne(
            ['_id' => DB::id($auth['userId'])],
            ['$set' => $update]
        );
        json_ok(['message' => 'Profile updated']);
    }

    public static function changePassword(Request $req): void {
        $auth = require_auth($req);
        validate($req->body, ['currentPassword' => 'required', 'newPassword' => 'required|min:8']);

        $user = DB::collection('users')->findOne(['_id' => DB::id($auth['userId'])]);
        if (!password_verify($req->get('currentPassword'), $user['password'])) {
            json_error('Current password is incorrect');
        }

        DB::collection('users')->updateOne(
            ['_id' => DB::id($auth['userId'])],
            ['$set' => ['password' => password_hash($req->get('newPassword'), PASSWORD_BCRYPT), 'updatedAt' => DB::now()]]
        );
        json_ok(['message' => 'Password changed successfully']);
    }
}

// ═══════════════════════════════════════════
// PROGRAMME CONTROLLER
// ═══════════════════════════════════════════
class ProgrammeController {

    private static function getProgramme(string $userId): array {
        $prog = DB::collection('programmes')->findOne(['userId' => $userId]);
        if (!$prog) json_error('Programme not found', 404);
        return DB::toArray($prog);
    }

    public static function get(Request $req): void {
        $auth = require_auth($req);
        json_ok(self::getProgramme($auth['userId']));
    }

    public static function updateBMC(Request $req): void {
        $auth = require_auth($req);
        validate($req->body, ['step' => 'required', 'content' => 'required']);

        $step    = (int)$req->get('step');
        $content = $req->get('content');

        DB::collection('programmes')->updateOne(
            ['userId' => $auth['userId']],
            ['$set' => [
                "bmc.$step"  => $content,
                'bmcStep'    => $step,
                'updatedAt'  => DB::now(),
            ]]
        );

        // Log activity
        self::logActivity($auth['userId'], 'bmc_step', "Completed BMC step $step");
        json_ok(['message' => 'BMC step saved', 'step' => $step]);
    }

    public static function updateAssessments(Request $req): void {
        $auth = require_auth($req);
        validate($req->body, ['key' => 'required', 'score' => 'required']);

        $key   = $req->get('key');
        $score = (int)$req->get('score');
        $valid = ['ns','mindset','skills','market'];
        if (!in_array($key, $valid)) json_error('Invalid assessment key');

        DB::collection('programmes')->updateOne(
            ['userId' => $auth['userId']],
            ['$set' => [
                "assessments.$key" => $score,
                'updatedAt'        => DB::now(),
            ]]
        );
        self::logActivity($auth['userId'], 'assessment', "Completed $key assessment: $score%");
        json_ok(['message' => 'Assessment saved', 'key' => $key, 'score' => $score]);
    }

    public static function updateOffer(Request $req): void {
        $auth = require_auth($req);
        $offer = $req->get('offer', []);

        DB::collection('programmes')->updateOne(
            ['userId' => $auth['userId']],
            ['$set' => ['offer' => $offer, 'updatedAt' => DB::now()]]
        );
        json_ok(['message' => 'Offer saved']);
    }

    public static function saveScript(Request $req): void {
        $auth = require_auth($req);
        validate($req->body, ['type' => 'required', 'content' => 'required']);

        $type    = $req->get('type'); // discovery, vsl, sparc, outbound, inbound
        $content = $req->get('content');
        $inputs  = $req->get('inputs', []);

        DB::collection('scripts')->updateOne(
            ['userId' => $auth['userId'], 'type' => $type],
            ['$set' => [
                'userId'    => $auth['userId'],
                'type'      => $type,
                'content'   => $content,
                'inputs'    => $inputs,
                'updatedAt' => DB::now(),
            ], '$setOnInsert' => ['createdAt' => DB::now()]],
            ['upsert' => true]
        );
        self::logActivity($auth['userId'], 'script', "Generated $type script");
        json_ok(['message' => 'Script saved']);
    }

    public static function getScripts(Request $req): void {
        $auth    = require_auth($req);
        $cursor  = DB::collection('scripts')->find(['userId' => $auth['userId']]);
        $scripts = [];
        foreach ($cursor as $doc) {
            $arr = DB::toArray($doc);
            $scripts[$arr['type']] = $arr;
        }
        json_ok($scripts);
    }

    public static function saveCapital(Request $req): void {
        $auth = require_auth($req);
        $data = $req->get('data', []);

        DB::collection('programmes')->updateOne(
            ['userId' => $auth['userId']],
            ['$set' => ['capital' => $data, 'updatedAt' => DB::now()]]
        );
        json_ok(['message' => 'Capital data saved']);
    }

    public static function saveCompetitor(Request $req): void {
        $auth = require_auth($req);
        $data = $req->get('data', []);

        DB::collection('programmes')->updateOne(
            ['userId' => $auth['userId']],
            ['$set' => ['competitor' => $data, 'updatedAt' => DB::now()]]
        );
        json_ok(['message' => 'Competitor data saved']);
    }

    public static function saveMVP(Request $req): void {
        $auth = require_auth($req);
        $data = $req->get('data', []);

        DB::collection('programmes')->updateOne(
            ['userId' => $auth['userId']],
            ['$set' => ['mvp' => $data, 'updatedAt' => DB::now()]]
        );
        json_ok(['message' => 'MVP data saved']);
    }

    public static function updateStage(Request $req): void {
        $auth  = require_auth($req);
        $stage = (int)$req->get('stage', 1);

        DB::collection('users')->updateOne(
            ['_id' => DB::id($auth['userId'])],
            ['$set' => ['stage' => $stage, 'updatedAt' => DB::now()]]
        );
        DB::collection('programmes')->updateOne(
            ['userId' => $auth['userId']],
            ['$set' => ['stage' => $stage, 'updatedAt' => DB::now()]]
        );
        json_ok(['message' => 'Stage updated', 'stage' => $stage]);
    }

    public static function getActivity(Request $req): void {
        $auth   = require_auth($req);
        $limit  = (int)($req->query['limit'] ?? 20);
        $cursor = DB::collection('activity')
            ->find(['userId' => $auth['userId']], ['sort' => ['createdAt' => -1], 'limit' => $limit]);
        $items = [];
        foreach ($cursor as $doc) $items[] = DB::toArray($doc);
        json_ok($items);
    }

    private static function logActivity(string $userId, string $type, string $message): void {
        DB::collection('activity')->insertOne([
            'userId'    => $userId,
            'type'      => $type,
            'message'   => $message,
            'createdAt' => DB::now(),
        ]);
    }
}

// ═══════════════════════════════════════════
// AI PROXY CONTROLLER
// ═══════════════════════════════════════════
class AIController {

    public static function generate(Request $req): void {
        $auth = require_auth($req);
        validate($req->body, ['prompt' => 'required']);

        $prompt   = $req->get('prompt');
        $history  = $req->get('history', []);
        $jsonMode = (bool)$req->get('jsonMode', false);

        $messages = empty($history)
            ? [['role' => 'user', 'content' => $prompt]]
            : $history;

        $result = self::callClaude($messages, $jsonMode);
        
        // Log usage
        DB::collection('ai_usage')->insertOne([
            'userId'    => $auth['userId'],
            'type'      => $jsonMode ? 'json' : 'text',
            'tokens'    => strlen($prompt) / 4, // estimate
            'createdAt' => DB::now(),
        ]);

        json_ok(['text' => $result]);
    }

    private static function callClaude(array $messages, bool $jsonMode = false): string {
        $apiKey = CLAUDE_KEY;
        if (empty($apiKey)) {
            return 'AI not configured — please set CLAUDE_API_KEY environment variable.';
        }

        $systemPrompt = self::getSystemPrompt($jsonMode);

        $payload = json_encode([
            'model'      => 'claude-sonnet-4-20250514',
            'max_tokens' => 1500,
            'system'     => $systemPrompt,
            'messages'   => $messages,
        ]);

        $ch = curl_init('https://api.anthropic.com/v1/messages');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'x-api-key: ' . $apiKey,
                'anthropic-version: 2023-06-01',
            ],
            CURLOPT_TIMEOUT        => 60,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            return 'AI service error — please try again.';
        }

        $data = json_decode($response, true);
        return $data['content'][0]['text'] ?? 'No response received.';
    }

    private static function getSystemPrompt(bool $jsonMode): string {
        $base = "You are an expert startup accelerator coach powering LaunchOS™. You know BMC, offer design, VSL scripting, SPARC™ sales formula (Surface→Probe→Amplify→Resolve→Close — objections pre-empted architecturally inside each stage), outbound/inbound marketing, capital budgeting, competitor analysis, MVP validation, and scaling. Be direct, specific, practitioner-grade. No fluff.";
        
        if ($jsonMode) {
            $base .= "\n\nRESPOND ONLY WITH VALID JSON. No markdown. No explanation. No preamble. No backticks.";
        }
        
        return $base;
    }
}

// ═══════════════════════════════════════════
// ADMIN CONTROLLER
// ═══════════════════════════════════════════
class AdminController {

    private static function requireAdmin(Request $req): array {
        $auth = require_auth($req);
        if (($auth['role'] ?? '') !== 'admin') {
            json_error('Admin access required', 403);
        }
        return $auth;
    }

    public static function getFounders(Request $req): void {
        self::requireAdmin($req);
        $limit  = (int)($req->query['limit'] ?? 50);
        $cursor = DB::collection('users')->find(
            ['role' => ['$ne' => 'admin']],
            ['sort' => ['createdAt' => -1], 'limit' => $limit, 'projection' => ['password' => 0]]
        );
        $founders = [];
        foreach ($cursor as $doc) {
            $arr = DB::toArray($doc);
            // Get programme stage
            $prog = DB::collection('programmes')->findOne(['userId' => $arr['_id']]);
            $arr['programmeStage'] = $prog ? ($prog['stage'] ?? 1) : 1;
            $founders[] = $arr;
        }
        json_ok($founders);
    }

    public static function getFounder(Request $req): void {
        self::requireAdmin($req);
        $userId = $req->query['id'] ?? '';
        $user   = DB::collection('users')->findOne(['_id' => DB::id($userId)], ['projection' => ['password' => 0]]);
        if (!$user) json_error('Founder not found', 404);

        $prog   = DB::collection('programmes')->findOne(['userId' => $userId]);
        $result = DB::toArray($user);
        $result['programme'] = $prog ? DB::toArray($prog) : [];
        json_ok($result);
    }

    public static function getStats(Request $req): void {
        self::requireAdmin($req);
        $stats = [
            'totalFounders' => DB::collection('users')->countDocuments(['role' => ['$ne' => 'admin']]),
            'activeThisWeek' => DB::collection('activity')->countDocuments([
                'createdAt' => ['$gte' => new MongoDB\BSON\UTCDateTime((time() - 604800) * 1000)]
            ]),
            'bmcCompleted' => DB::collection('programmes')->countDocuments([
                'bmc' => ['$exists' => true, '$ne' => []],
            ]),
            'scriptsGenerated' => DB::collection('scripts')->countDocuments([]),
            'aiCallsToday' => DB::collection('ai_usage')->countDocuments([
                'createdAt' => ['$gte' => new MongoDB\BSON\UTCDateTime(strtotime('today') * 1000)]
            ]),
            'stageDistribution' => [],
        ];

        // Stage distribution
        for ($s = 1; $s <= 9; $s++) {
            $stats['stageDistribution'][$s] = DB::collection('programmes')->countDocuments(['stage' => $s]);
        }

        json_ok($stats);
    }

    public static function createAdmin(Request $req): void {
        // Only works if no admin exists yet (first-time setup)
        $existing = DB::collection('users')->findOne(['role' => 'admin']);
        if ($existing) json_error('Admin already exists', 403);

        validate($req->body, ['name' => 'required', 'email' => 'required|email', 'password' => 'required|min:8']);

        $email  = strtolower(trim($req->get('email')));
        $userId = DB::collection('users')->insertOne([
            'name'      => $req->get('name'),
            'email'     => $email,
            'password'  => password_hash($req->get('password'), PASSWORD_BCRYPT),
            'role'      => 'admin',
            'createdAt' => DB::now(),
            'updatedAt' => DB::now(),
        ])->getInsertedId();

        $token = JWT::encode(['userId' => (string)$userId, 'email' => $email, 'role' => 'admin']);
        json_ok(['token' => $token, 'message' => 'Admin created successfully'], 201);
    }
}

// ═══════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════
function healthCheck(): void {
    try {
        DB::get()->command(['ping' => 1]);
        $dbStatus = 'connected';
    } catch (Exception $e) {
        $dbStatus = 'error: ' . $e->getMessage();
    }

    json_ok([
        'status'    => 'LaunchOS™ API running',
        'version'   => '4.0.0',
        'php'       => PHP_VERSION,
        'database'  => $dbStatus,
        'timestamp' => date('c'),
    ]);
}

// ═══════════════════════════════════════════
// ROUTE DEFINITIONS
// ═══════════════════════════════════════════
$router = new Router();

// Health
$router->add('GET',  '/api/health',                   fn($r) => healthCheck());

// Auth
$router->add('POST', '/api/auth/register',             [AuthController::class, 'register']);
$router->add('POST', '/api/auth/login',                [AuthController::class, 'login']);
$router->add('GET',  '/api/auth/me',                   [AuthController::class, 'me']);
$router->add('PUT',  '/api/auth/profile',              [AuthController::class, 'updateProfile']);
$router->add('PUT',  '/api/auth/password',             [AuthController::class, 'changePassword']);

// Programme data
$router->add('GET',  '/api/programme',                 [ProgrammeController::class, 'get']);
$router->add('PUT',  '/api/programme/bmc',             [ProgrammeController::class, 'updateBMC']);
$router->add('PUT',  '/api/programme/assessments',     [ProgrammeController::class, 'updateAssessments']);
$router->add('PUT',  '/api/programme/offer',           [ProgrammeController::class, 'updateOffer']);
$router->add('PUT',  '/api/programme/capital',         [ProgrammeController::class, 'saveCapital']);
$router->add('PUT',  '/api/programme/competitor',      [ProgrammeController::class, 'saveCompetitor']);
$router->add('PUT',  '/api/programme/mvp',             [ProgrammeController::class, 'saveMVP']);
$router->add('PUT',  '/api/programme/stage',           [ProgrammeController::class, 'updateStage']);
$router->add('POST', '/api/programme/scripts',         [ProgrammeController::class, 'saveScript']);
$router->add('GET',  '/api/programme/scripts',         [ProgrammeController::class, 'getScripts']);
$router->add('GET',  '/api/programme/activity',        [ProgrammeController::class, 'getActivity']);

// AI Proxy
$router->add('POST', '/api/ai/generate',               [AIController::class, 'generate']);

// Admin
$router->add('POST', '/api/admin/setup',               [AdminController::class, 'createAdmin']);
$router->add('GET',  '/api/admin/founders',            [AdminController::class, 'getFounders']);
$router->add('GET',  '/api/admin/founders/{id}',       [AdminController::class, 'getFounder']);
$router->add('GET',  '/api/admin/stats',               [AdminController::class, 'getStats']);

// ═══════════════════════════════════════════
// DISPATCH
// ═══════════════════════════════════════════
try {
    $request = new Request();
    $router->dispatch($request);
} catch (MongoDB\Driver\Exception\Exception $e) {
    json_error('Database error: ' . $e->getMessage(), 500);
} catch (Throwable $e) {
    $msg = APP_ENV === 'development' ? $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine() : 'Server error';
    json_error($msg, 500);
}
