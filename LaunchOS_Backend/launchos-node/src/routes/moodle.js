const router = require('express').Router();
const { auth, roles } = require('../middleware/auth');
const User = require('../models/User');
const Programme = require('../models/Programme');

const moodleAPI = async (wsfunction, params = {}) => {
  const url = process.env.MOODLE_URL?.replace(/\/$/, '');
  const token = process.env.MOODLE_TOKEN;
  if (!url || !token) throw new Error('Moodle not configured on server');
  const body = new URLSearchParams({ wstoken: token, wsfunction, moodlewsrestformat: 'json', ...params });
  const r = await fetch(url + '/webservice/rest/server.php', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body });
  const d = await r.json();
  if (d.exception) throw new Error(d.message || d.exception);
  return d;
};

// GET /api/moodle/site-info
router.get('/site-info', auth, roles('admin','trainer'), async (req, res) => {
  try { res.json({ info: await moodleAPI('core_webservice_get_site_info') }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/moodle/courses
router.get('/courses', auth, async (req, res) => {
  try { res.json({ courses: await moodleAPI('core_course_get_courses') }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/moodle/enrol — enrol a founder in a course
router.post('/enrol', auth, roles('admin','trainer'), async (req, res) => {
  try {
    const { userId, courseId, roleId = 5 } = req.body;
    if (!userId || !courseId) return res.status(400).json({ error: 'userId and courseId required' });
    await moodleAPI('enrol_manual_enrol_users', { 'enrolments[0][roleid]': roleId, 'enrolments[0][userid]': userId, 'enrolments[0][courseid]': courseId });
    await Programme.findOneAndUpdate({ founderId: req.body.founderId || userId }, { 'moodle.courseId': courseId, 'moodle.enrolled': true, 'moodle.lastSync': new Date() });
    res.json({ message: 'Enrolled successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/moodle/users/:courseId — enrolled users
router.get('/users/:courseId', auth, roles('admin','trainer'), async (req, res) => {
  try { res.json({ users: await moodleAPI('core_enrol_get_enrolled_users', { courseid: req.params.courseId }) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/moodle/create-course
router.post('/create-course', auth, roles('admin'), async (req, res) => {
  try {
    const { fullname, shortname, categoryid = 1 } = req.body;
    const result = await moodleAPI('core_course_create_courses', {
      'courses[0][fullname]': fullname, 'courses[0][shortname]': shortname,
      'courses[0][categoryid]': categoryid, 'courses[0][format]': 'topics', 'courses[0][visible]': 1
    });
    res.json({ course: result[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;