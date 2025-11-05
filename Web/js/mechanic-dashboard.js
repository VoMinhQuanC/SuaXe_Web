// mechanicsRoutes.js - Routes cho chức năng quản lý kỹ thuật viên
const express = require('express');
const router = express.Router();
const { pool } = require('./db');
const { authenticateToken } = require('./authRoutes');
const nodemailer = require('nodemailer');

// Middleware kiểm tra quyền kỹ thuật viên
const checkMechanicAccess = (req, res, next) => {
    if (req.user.role !== 3) {
        return res.status(403).json({
            success: false,
            message: 'Không có quyền truy cập. Yêu cầu quyền kỹ thuật viên.'
        });
    }
    next();
};

// Cấu hình nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'your-email@gmail.com', // Email của bạn
        pass: process.env.EMAIL_PASS || 'your-password' // Mật khẩu ứng dụng (không phải mật khẩu email)
    }
});

/**
 * API: Thống kê dashboard kỹ thuật viên
 * GET /api/mechanics/dashboard/stats
 */
router.get('/dashboard/stats', authenticateToken, checkMechanicAccess, async (req, res) => {
    try {
        const mechanicId = req.user.userId;
        
        // Lấy số lịch hẹn hôm nay
        const today = new Date().toISOString().split('T')[0];
        const [todayAppointments] = await pool.query(
            'SELECT COUNT(*) as count FROM Appointments WHERE MechanicID = ? AND DATE(AppointmentDate) = ?',
            [mechanicId, today]
        );
        
        // Lấy số lịch hẹn đang chờ xử lý
        const [pendingAppointments] = await pool.query(
            'SELECT COUNT(*) as count FROM Appointments WHERE MechanicID = ? AND Status IN ("Pending", "Confirmed")',
            [mechanicId]
        );
        
        // Lấy số lịch hẹn đã hoàn thành trong tuần này
        const [weeklyCompleted] = await pool.query(
            `SELECT COUNT(*) as count FROM Appointments 
             WHERE MechanicID = ? AND Status = "Completed" 
             AND YEARWEEK(AppointmentDate, 1) = YEARWEEK(CURDATE(), 1)`,
            [mechanicId]
        );
        
        // Lấy điểm đánh giá trung bình
        const [averageRating] = await pool.query(
            'SELECT AVG(Rating) as avgRating FROM MechanicReviews WHERE MechanicID = ?',
            [mechanicId]
        );
        
        res.json({
            success: true,
            stats: {
                todayAppointments: todayAppointments[0].count,
                pendingAppointments: pendingAppointments[0].count,
                weeklyCompleted: weeklyCompleted[0].count,
                averageRating: averageRating[0].avgRating || 0
            }
        });
    } catch (err) {
        console.error('Lỗi khi lấy thống kê dashboard kỹ thuật viên:', err);
        res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + err.message
        });
    }
});

/**
 * API: Lấy danh sách lịch hẹn sắp tới của kỹ thuật viên
 * GET /api/mechanics/appointments/upcoming
 */
router.get('/appointments/upcoming', authenticateToken, checkMechanicAccess, async (req, res) => {
    try {
        const mechanicId = req.user.userId;
        
        // Lấy danh sách lịch hẹn sắp tới (hôm nay và tương lai)
        const [appointments] = await pool.query(
            `SELECT a.*, u.FullName as CustomerName,
             (SELECT GROUP_CONCAT(s.ServiceName SEPARATOR ', ') 
              FROM AppointmentServices ap 
              JOIN Services s ON ap.ServiceID = s.ServiceID 
              WHERE ap.AppointmentID = a.AppointmentID) AS Services
             FROM Appointments a
             LEFT JOIN Users u ON a.UserID = u.UserID
             WHERE a.MechanicID = ? AND a.Status IN ('Pending', 'Confirmed', 'InProgress')
             AND a.AppointmentDate >= CURDATE()
             ORDER BY a.AppointmentDate ASC
             LIMIT 10`,
            [mechanicId]
        );
        
        res.json({
            success: true,
            appointments
        });
    } catch (err) {
        console.error('Lỗi khi lấy danh sách lịch hẹn kỹ thuật viên:', err);
        res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + err.message
        });
    }
});

/**
 * API: Lấy tất cả lịch hẹn của kỹ thuật viên
 * GET /api/mechanics/appointments
 */
router.get('/appointments', authenticateToken, checkMechanicAccess, async (req, res) => {
    try {
        const mechanicId = req.user.userId;
        const { status, date } = req.query;
        
        // Tạo truy vấn động dựa trên tham số
        let query = `
            SELECT a.*, u.FullName as CustomerName, v.LicensePlate, v.Brand, v.Model,
            (SELECT GROUP_CONCAT(s.ServiceName SEPARATOR ', ') 
             FROM AppointmentServices ap 
             JOIN Services s ON ap.ServiceID = s.ServiceID 
             WHERE ap.AppointmentID = a.AppointmentID) AS Services
            FROM Appointments a
            LEFT JOIN Users u ON a.UserID = u.UserID
            LEFT JOIN Vehicles v ON a.VehicleID = v.VehicleID
            WHERE a.MechanicID = ?
        `;
        
        const queryParams = [mechanicId];
        
        // Thêm điều kiện lọc theo trạng thái
        if (status) {
            query += ' AND a.Status = ?';
            queryParams.push(status);
        }
        
        // Thêm điều kiện lọc theo ngày
        if (date) {
            query += ' AND DATE(a.AppointmentDate) = ?';
            queryParams.push(date);
        }
        
        // Thêm sắp xếp
        query += ' ORDER BY a.AppointmentDate DESC';
        
        // Thực hiện truy vấn
        const [appointments] = await pool.query(query, queryParams);
        
        res.json({
            success: true,
            appointments
        });
    } catch (err) {
        console.error('Lỗi khi lấy danh sách lịch hẹn kỹ thuật viên:', err);
        res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + err.message
        });
    }
});

/**
 * API: Lấy danh sách lịch làm việc của kỹ thuật viên
 * GET /api/mechanics/schedules
 */
router.get('/schedules', authenticateToken, checkMechanicAccess, async (req, res) => {
    try {
        const mechanicId = req.user.userId;
        const { from, to } = req.query;
        
        let query = 'SELECT * FROM MechanicSchedules WHERE MechanicID = ?';
        const queryParams = [mechanicId];
        
        // Thêm điều kiện lọc theo khoảng thời gian
        if (from && to) {
            query += ' AND EndTime >= ? AND StartTime <= ?';
            queryParams.push(from, to);
        } else if (from) {
            query += ' AND EndTime >= ?';
            queryParams.push(from);
        } else if (to) {
            query += ' AND StartTime <= ?';
            queryParams.push(to);
        }
        
        // Thêm sắp xếp
        query += ' ORDER BY StartTime DESC';
        
        // Thực hiện truy vấn
        const [schedules] = await pool.query(query, queryParams);
        
        res.json({
            success: true,
            schedules
        });
    } catch (err) {
        console.error('Lỗi khi lấy lịch làm việc kỹ thuật viên:', err);
        res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + err.message
        });
    }
});

/**
 * API: Thêm lịch làm việc mới
 * POST /api/mechanics/schedules
 */
router.post('/schedules', authenticateToken, checkMechanicAccess, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { startTime, endTime, type, notes } = req.body;
        const mechanicId = req.user.userId;
        
        // Kiểm tra dữ liệu đầu vào
        if (!startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng cung cấp đầy đủ thời gian bắt đầu và kết thúc'
            });
        }
        
        // Kiểm tra thời gian hợp lệ
        const startDate = new Date(startTime);
        const endDate = new Date(endTime);
        
        if (startDate >= endDate) {
            return res.status(400).json({
                success: false,
                message: 'Thời gian kết thúc phải sau thời gian bắt đầu'
            });
        }
        
        // Kiểm tra trùng lịch
        const [overlappingSchedules] = await connection.query(
            `SELECT * FROM MechanicSchedules 
             WHERE MechanicID = ? 
             AND ((StartTime <= ? AND EndTime > ?) OR (StartTime < ? AND EndTime >= ?) OR (StartTime >= ? AND EndTime <= ?))`,
            [mechanicId, startTime, startTime, endTime, endTime, startTime, endTime]
        );
        
        if (overlappingSchedules.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Thời gian bị trùng với lịch làm việc khác',
                conflictingSchedules: overlappingSchedules
            });
        }
        
        // Thêm lịch làm việc mới
        const [result] = await connection.query(
            'INSERT INTO MechanicSchedules (MechanicID, StartTime, EndTime, Type, Notes, Status) VALUES (?, ?, ?, ?, ?, ?)',
            [mechanicId, startTime, endTime, type || 'available', notes || null, 'Pending']
        );
        
        const scheduleId = result.insertId;
        
        // Thông báo cho admin về lịch mới (tuỳ chọn)
        // Gửi email thông báo cho admin
        try {
            const [adminEmails] = await connection.query(
                'SELECT Email FROM Users WHERE RoleID = 1'
            );
            
            if (adminEmails.length > 0) {
                const adminEmailAddresses = adminEmails.map(admin => admin.Email).join(',');
                
                const startTimeFormatted = new Date(startTime).toLocaleString('vi-VN');
                const endTimeFormatted = new Date(endTime).toLocaleString('vi-VN');
                
                const mailOptions = {
                    from: process.env.EMAIL_USER || 'your-email@gmail.com',
                    to: adminEmailAddresses,
                    subject: 'Đăng ký lịch làm việc mới từ kỹ thuật viên',
                    html: `
                        <h2>Thông báo đăng ký lịch làm việc mới</h2>
                        <p><strong>Kỹ thuật viên:</strong> ${req.user.fullName} (ID: ${mechanicId})</p>
                        <p><strong>Thời gian bắt đầu:</strong> ${startTimeFormatted}</p>
                        <p><strong>Thời gian kết thúc:</strong> ${endTimeFormatted}</p>
                        <p><strong>Loại lịch:</strong> ${type === 'available' ? 'Có thể làm việc' : 'Không thể làm việc'}</p>
                        <p><strong>Ghi chú:</strong> ${notes || 'Không có'}</p>
                        <p>Vui lòng đăng nhập vào hệ thống để phê duyệt lịch làm việc này.</p>
                    `
                };
                
                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        console.error('Lỗi khi gửi email thông báo:', error);
                    } else {
                        console.log('Đã gửi email thông báo thành công:', info.response);
                    }
                });
            }
        } catch (emailError) {
            console.error('Lỗi khi gửi email thông báo:', emailError);
            // Không cần trả về lỗi nếu chỉ là lỗi gửi mail
        }
        
        await connection.commit();
        
        res.status(201).json({
            success: true,
            message: 'Đăng ký lịch làm việc thành công, đang chờ phê duyệt',
            scheduleId
        });
    } catch (err) {
        await connection.rollback();
        console.error('Lỗi khi đăng ký lịch làm việc:', err);
        res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + err.message
        });
    } finally {
        connection.release();
    }
});

/**
 * API: Cập nhật lịch làm việc
 * PUT /api/mechanics/schedules/:id
 */
router.put('/schedules/:id', authenticateToken, checkMechanicAccess, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const scheduleId = req.params.id;
        const { startTime, endTime, type, notes } = req.body;
        const mechanicId = req.user.userId;
        
        // Kiểm tra lịch làm việc có tồn tại không
        const [scheduleCheck] = await connection.query(
            'SELECT * FROM MechanicSchedules WHERE ScheduleID = ? AND MechanicID = ?',
            [scheduleId, mechanicId]
        );
        
        if (scheduleCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy lịch làm việc của bạn'
            });
        }
        
        const schedule = scheduleCheck[0];
        
        // Kiểm tra trạng thái lịch
        if (schedule.Status === 'Approved' && (new Date(schedule.StartTime) <= new Date())) {
            return res.status(400).json({
                success: false,
                message: 'Không thể cập nhật lịch đã được duyệt và đã bắt đầu'
            });
        }
        
        // Kiểm tra dữ liệu đầu vào
        if (!startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng cung cấp đầy đủ thời gian bắt đầu và kết thúc'
            });
        }
        
        // Kiểm tra thời gian hợp lệ
        const startDate = new Date(startTime);
        const endDate = new Date(endTime);
        
        if (startDate >= endDate) {
            return res.status(400).json({
                success: false,
                message: 'Thời gian kết thúc phải sau thời gian bắt đầu'
            });
        }
        
        // Kiểm tra trùng lịch với lịch khác
        const [overlappingSchedules] = await connection.query(
            `SELECT * FROM MechanicSchedules 
             WHERE MechanicID = ? AND ScheduleID != ?
             AND ((StartTime <= ? AND EndTime > ?) OR (StartTime < ? AND EndTime >= ?) OR (StartTime >= ? AND EndTime <= ?))`,
            [mechanicId, scheduleId, startTime, startTime, endTime, endTime, startTime, endTime]
        );
        
        if (overlappingSchedules.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Thời gian bị trùng với lịch làm việc khác',
                conflictingSchedules: overlappingSchedules
            });
        }
        
        // Cập nhật lịch làm việc
        await connection.query(
            'UPDATE MechanicSchedules SET StartTime = ?, EndTime = ?, Type = ?, Notes = ?, Status = ? WHERE ScheduleID = ?',
            [startTime, endTime, type || 'available', notes || null, 'Pending', scheduleId]
        );
        
        // Gửi thông báo cho admin về việc cập nhật lịch (tuỳ chọn)
        try {
            const [adminEmails] = await connection.query(
                'SELECT Email FROM Users WHERE RoleID = 1'
            );
            
            if (adminEmails.length > 0) {
                const adminEmailAddresses = adminEmails.map(admin => admin.Email).join(',');
                
                const startTimeFormatted = new Date(startTime).toLocaleString('vi-VN');
                const endTimeFormatted = new Date(endTime).toLocaleString('vi-VN');
                
                const mailOptions = {
                    from: process.env.EMAIL_USER || 'your-email@gmail.com',
                    to: adminEmailAddresses,
                    subject: 'Cập nhật lịch làm việc từ kỹ thuật viên',
                    html: `
                        <h2>Thông báo cập nhật lịch làm việc</h2>
                        <p><strong>Kỹ thuật viên:</strong> ${req.user.fullName} (ID: ${mechanicId})</p>
                        <p><strong>Mã lịch:</strong> ${scheduleId}</p>
                        <p><strong>Thời gian bắt đầu:</strong> ${startTimeFormatted}</p>
                        <p><strong>Thời gian kết thúc:</strong> ${endTimeFormatted}</p>
                        <p><strong>Loại lịch:</strong> ${type === 'available' ? 'Có thể làm việc' : 'Không thể làm việc'}</p>
                        <p><strong>Ghi chú:</strong> ${notes || 'Không có'}</p>
                        <p>Vui lòng đăng nhập vào hệ thống để phê duyệt lịch làm việc này.</p>
                    `
                };
                
                transporter.sendMail(mailOptions);
            }
        } catch (emailError) {
            console.error('Lỗi khi gửi email thông báo:', emailError);
            // Không cần trả về lỗi nếu chỉ là lỗi gửi mail
        }
        
        await connection.commit();
        
        res.json({
            success: true,
            message: 'Cập nhật lịch làm việc thành công, đang chờ phê duyệt'
        });
    } catch (err) {
        await connection.rollback();
        console.error('Lỗi khi cập nhật lịch làm việc:', err);
        res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + err.message
        });
    } finally {
        connection.release();
    }
});

/**
 * API: Xóa lịch làm việc
 * DELETE /api/mechanics/schedules/:id
 */
router.delete('/schedules/:id', authenticateToken, checkMechanicAccess, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const scheduleId = req.params.id;
        const mechanicId = req.user.userId;
        
        // Kiểm tra lịch làm việc có tồn tại không
        const [scheduleCheck] = await connection.query(
            'SELECT * FROM MechanicSchedules WHERE ScheduleID = ? AND MechanicID = ?',
            [scheduleId, mechanicId]
        );
        
        if (scheduleCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy lịch làm việc của bạn'
            });
        }
        
        const schedule = scheduleCheck[0];
        
        // Kiểm tra trạng thái lịch
        if (schedule.Status === 'Approved' && (new Date(schedule.StartTime) <= new Date())) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa lịch đã được duyệt và đã bắt đầu'
            });
        }
        
        // Kiểm tra lịch hẹn liên quan
        const [relatedAppointments] = await connection.query(
            `SELECT * FROM Appointments 
             WHERE MechanicID = ? 
             AND AppointmentDate >= ? 
             AND AppointmentDate <= ?`,
            [mechanicId, schedule.StartTime, schedule.EndTime]
        );
        
        if (relatedAppointments.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa lịch làm việc đã có lịch hẹn',
                relatedAppointments
            });
        }
        
        // Xóa lịch làm việc
        await connection.query(
            'DELETE FROM MechanicSchedules WHERE ScheduleID = ?',
            [scheduleId]
        );
        
        // Gửi thông báo cho admin về việc xóa lịch (tuỳ chọn)
        try {
            const [adminEmails] = await connection.query(
                'SELECT Email FROM Users WHERE RoleID = 1'
            );
            
            if (adminEmails.length > 0) {
                const adminEmailAddresses = adminEmails.map(admin => admin.Email).join(',');
                
                const startTimeFormatted = new Date(schedule.StartTime).toLocaleString('vi-VN');
                const endTimeFormatted = new Date(schedule.EndTime).toLocaleString('vi-VN');
                
                const mailOptions = {
                    from: process.env.EMAIL_USER || 'your-email@gmail.com',
                    to: adminEmailAddresses,
                    subject: 'Xóa lịch làm việc',
                    html: `
                        <h2>Thông báo xóa lịch làm việc</h2>
                        <p><strong>Kỹ thuật viên:</strong> ${req.user.fullName} (ID: ${mechanicId})</p>
                        <p><strong>Mã lịch:</strong> ${scheduleId}</p>
                        <p><strong>Thời gian bắt đầu:</strong> ${startTimeFormatted}</p>
                        <p><strong>Thời gian kết thúc:</strong> ${endTimeFormatted}</p>
                        <p><strong>Loại lịch:</strong> ${schedule.Type === 'available' ? 'Có thể làm việc' : 'Không thể làm việc'}</p>
                        <p><strong>Ghi chú:</strong> ${schedule.Notes || 'Không có'}</p>
                        <p>Kỹ thuật viên đã xóa lịch làm việc này.</p>
                    `
                };
                
                transporter.sendMail(mailOptions);
            }
        } catch (emailError) {
            console.error('Lỗi khi gửi email thông báo:', emailError);
            // Không cần trả về lỗi nếu chỉ là lỗi gửi mail
        }
        
        await connection.commit();
        
        res.json({
            success: true,
            message: 'Xóa lịch làm việc thành công'
        });
    } catch (err) {
        await connection.rollback();
        console.error('Lỗi khi xóa lịch làm việc:', err);
        res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + err.message
        });
    } finally {
        connection.release();
    }
});

/**
 * API: Lấy thông báo của kỹ thuật viên
 * GET /api/mechanics/notifications
 */
router.get('/notifications', authenticateToken, checkMechanicAccess, async (req, res) => {
    try {
        const mechanicId = req.user.userId;
        const limit = req.query.limit || 10;
        
        // Lấy danh sách thông báo
        const [notifications] = await pool.query(
            `SELECT * FROM Notifications 
             WHERE UserID = ? 
             ORDER BY CreatedAt DESC 
             LIMIT ?`,
            [mechanicId, parseInt(limit)]
        );
        
        res.json({
            success: true,
            notifications
        });
    } catch (err) {
        console.error('Lỗi khi lấy thông báo kỹ thuật viên:', err);
        res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + err.message
        });
    }
});

/**
 * API: Đánh dấu thông báo đã đọc
 * PUT /api/mechanics/notifications/:id/read
 */
router.put('/notifications/:id/read', authenticateToken, checkMechanicAccess, async (req, res) => {
    try {
        const notificationId = req.params.id;
        const mechanicId = req.user.userId;
        
        // Kiểm tra thông báo có phải của kỹ thuật viên không
        const [notificationCheck] = await pool.query(
            'SELECT * FROM Notifications WHERE NotificationID = ? AND UserID = ?',
            [notificationId, mechanicId]
        );
        
        if (notificationCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy thông báo'
            });
        }
        
        // Cập nhật trạng thái đã đọc
        await pool.query(
            'UPDATE Notifications SET IsRead = true WHERE NotificationID = ?',
            [notificationId]
        );
        
        res.json({
            success: true,
            message: 'Đã đánh dấu thông báo là đã đọc'
        });
    } catch (err) {
        console.error('Lỗi khi cập nhật trạng thái thông báo:', err);
        res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + err.message
        });
    }
});

/**
 * API: Cập nhật trạng thái lịch hẹn
 * PUT /api/mechanics/appointments/:id/status
 */
router.put('/appointments/:id/status', authenticateToken, checkMechanicAccess, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const appointmentId = req.params.id;
        const { status, notes } = req.body;
        const mechanicId = req.user.userId;
        
        // Kiểm tra lịch hẹn có tồn tại không
        const [appointmentCheck] = await connection.query(
            'SELECT * FROM Appointments WHERE AppointmentID = ? AND MechanicID = ?',
            [appointmentId, mechanicId]
        );
        
        if (appointmentCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy lịch hẹn của bạn'
            });
        }
        
        const appointment = appointmentCheck[0];
        
        // Kiểm tra trạng thái hợp lệ
        const validStatuses = ['Pending', 'Confirmed', 'InProgress', 'Completed', 'Canceled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Trạng thái không hợp lệ'
            });
        }
        
        // Kiểm tra chuyển trạng thái hợp lệ
        if (appointment.Status === 'Canceled' && status !== 'Canceled') {
            return res.status(400).json({
                success: false,
                message: 'Không thể thay đổi trạng thái của lịch hẹn đã hủy'
            });
        }
        
        if (appointment.Status === 'Completed' && status !== 'Completed') {
            return res.status(400).json({
                success: false,
                message: 'Không thể thay đổi trạng thái của lịch hẹn đã hoàn thành'
            });
        }
        
        // Cập nhật trạng thái lịch hẹn
        await connection.query(
            'UPDATE Appointments SET Status = ?, Notes = ? WHERE AppointmentID = ?',
            [status, notes || appointment.Notes, appointmentId]
        );
        
        // Thêm thông báo cho khách hàng
        let notificationTitle = '';
        let notificationMessage = '';
        
        switch (status) {
            case 'Confirmed':
                notificationTitle = 'Lịch hẹn đã được xác nhận';
                notificationMessage = `Lịch hẹn #${appointmentId} của bạn đã được kỹ thuật viên xác nhận.`;
                break;
            case 'InProgress':
                notificationTitle = 'Lịch hẹn đang được thực hiện';
                notificationMessage = `Lịch hẹn #${appointmentId} của bạn đang được kỹ thuật viên thực hiện.`;
                break;
            case 'Completed':
                notificationTitle = 'Lịch hẹn đã hoàn thành';
                notificationMessage = `Lịch hẹn #${appointmentId} của bạn đã được hoàn thành.`;
                break;
            case 'Canceled':
                notificationTitle = 'Lịch hẹn đã bị hủy';
                notificationMessage = `Lịch hẹn #${appointmentId} của bạn đã bị hủy.`;
                break;
        }
        
        if (notificationTitle) {
            await connection.query(
                'INSERT INTO Notifications (UserID, Title, Message, Type, ReferenceID) VALUES (?, ?, ?, ?, ?)',
                [appointment.UserID, notificationTitle, notificationMessage, 'appointment', appointmentId]
            );
            
            // Gửi email thông báo cho khách hàng
            try {
                const [userInfo] = await connection.query(
                    'SELECT FullName, Email FROM Users WHERE UserID = ?',
                    [appointment.UserID]
                );
                
                if (userInfo.length > 0 && userInfo[0].Email) {
                    const customerEmail = userInfo[0].Email;
                    const customerName = userInfo[0].FullName;
                    
                    const appointmentDate = new Date(appointment.AppointmentDate).toLocaleString('vi-VN');
                    
                    const mailOptions = {
                        from: process.env.EMAIL_USER || 'your-email@gmail.com',
                        to: customerEmail,
                        subject: notificationTitle,
                        html: `
                            <h2>${notificationTitle}</h2>
                            <p>Xin chào ${customerName},</p>
                            <p>${notificationMessage}</p>
                            <p><strong>Thời gian hẹn:</strong> ${appointmentDate}</p>
                            <p><strong>Ghi chú:</strong> ${notes || 'Không có'}</p>
                            <p>Cảm ơn bạn đã sử dụng dịch vụ của chúng tôi.</p>
                        `
                    };
                    
                    transporter.sendMail(mailOptions);
                }
            } catch (emailError) {
                console.error('Lỗi khi gửi email thông báo:', emailError);
                // Không cần trả về lỗi nếu chỉ là lỗi gửi mail
            }
        }
        
        await connection.commit();
        
        res.json({
            success: true,
            message: 'Cập nhật trạng thái lịch hẹn thành công'
        });
    } catch (err) {
        await connection.rollback();
        console.error('Lỗi khi cập nhật trạng thái lịch hẹn:', err);
        res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + err.message
        });
    } finally {
        connection.release();
    }
});

module.exports = router;