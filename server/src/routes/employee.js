const express = require('express');
const multer = require('multer');
const { authenticate } = require('../middleware/authMiddleware');
const { requireEmployeeLink } = require('../middleware/requireEmployeeLink');
const { getProfile, updateProfile } = require('../controllers/employeePortal/profileController');
const { getHomeSummary, getNextShift, getActivity } = require('../controllers/employeePortal/homeController');
const { getCertifications, uploadCertification } = require('../controllers/employeePortal/requirementsController');
const { getWeekSchedule, getScheduleHistory } = require('../controllers/employeePortal/scheduleController');
const { getAvailability, submitAvailabilityRequest, getTimeOffRequests, submitTimeOff } = require('../controllers/employeePortal/availabilityController');
const { getPayrollSummary, getPaystubs, downloadPaystub } = require('../controllers/employeePortal/payrollController');
const { getTasks, completeTask } = require('../controllers/employeePortal/tasksController');
const { getMessages, sendMessage, markRead } = require('../controllers/employeePortal/chatController');
const { getNotifications, markNotificationsRead } = require('../controllers/employeePortal/notificationController');

const certUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = express.Router();

router.use(authenticate);
router.use(requireEmployeeLink);

// Home
router.get('/home/summary', getHomeSummary);
router.get('/home/next-shift', getNextShift);
router.get('/home/activity', getActivity);

// Profile
router.get('/profile', getProfile);
router.patch('/profile', updateProfile);

// Requirements
router.get('/certifications', getCertifications);
router.post('/certifications/:certId/upload', certUpload.single('file'), uploadCertification);

// Schedule
router.get('/schedule/week', getWeekSchedule);
router.get('/schedule/history', getScheduleHistory);

// Availability & Time Off
router.get('/availability', getAvailability);
router.post('/availability/request', submitAvailabilityRequest);
router.get('/time-off', getTimeOffRequests);
router.post('/time-off', submitTimeOff);

// Payroll
router.get('/payroll/summary', getPayrollSummary);
router.get('/payroll/stubs', getPaystubs);
router.get('/payroll/stubs/:id/download', downloadPaystub);

// Tasks
router.get('/tasks', getTasks);
router.patch('/tasks/:id/complete', completeTask);

// Chat
router.get('/chat/messages', getMessages);
router.post('/chat/messages', sendMessage);
router.patch('/chat/read', markRead);

// Notifications
router.get('/notifications', getNotifications);
router.patch('/notifications/read', markNotificationsRead);

module.exports = router;
