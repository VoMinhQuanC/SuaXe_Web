// profileRoutes.js - Routes cho chức năng quản lý thông tin cá nhân

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('./authRoutes');
const { pool } = require('../db');

// CẤU HÌNH UPLOAD AVATAR

// Tạo thư mục lưu trữ avatar nếu chưa tồn tại
let avatarDir;
try {
    // Trong môi trường production (App Engine)
    if (process.env.NODE_ENV === 'production') {
        avatarDir = '/tmp/avatars'; // Sử dụng thư mục /tmp trong App Engine
    } else {
        // Môi trường development
        avatarDir = path.join(__dirname, '../../Web/images/avatars');
    }

    if (!fs.existsSync(avatarDir)) {
        fs.mkdirSync(avatarDir, { recursive: true });
        console.log('Đã tạo thư mục avatar:', avatarDir);
    }
} catch (err) {
    console.error('Không thể tạo thư mục avatar:', err);
    // Sử dụng một thư mục dự phòng
    avatarDir = process.env.NODE_ENV === 'production' ? '/tmp' : path.join(__dirname, '../');
    console.log('Sử dụng thư mục dự phòng:', avatarDir);
}

// Cấu hình storage cho avatar
const avatarStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, avatarDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Filter cho avatar (chỉ cho phép định dạng ảnh)
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Chỉ cho phép upload file hình ảnh!'), false);
    }
};

const uploadAvatar = multer({
    storage: avatarStorage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 2 * 1024 * 1024 // Giới hạn 2MB
    }
});

/**
 * API: Cập nhật thông tin hồ sơ cá nhân
 * Method: PUT
 * Endpoint: /users/profile
 */
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { fullName, phoneNumber, address } = req.body;
        
        // Kiểm tra dữ liệu đầu vào
        if (!fullName || !phoneNumber) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng cung cấp đầy đủ thông tin họ tên và số điện thoại'
            });
        }
        
        // Cập nhật thông tin người dùng
        await pool.query(
            'UPDATE Users SET FullName = ?, PhoneNumber = ?, Address = ? WHERE UserID = ?',
            [fullName, phoneNumber, address || null, userId]
        );
        
        res.json({
            success: true,
            message: 'Cập nhật thông tin cá nhân thành công'
        });
    } catch (err) {
        console.error('Lỗi khi cập nhật thông tin cá nhân:', err);
        res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + err.message
        });
    }
});

/**
 * API: Upload avatar
 * Method: POST
 * Endpoint: /users/profile/upload-avatar
 */
router.post('/profile/upload-avatar', authenticateToken, uploadAvatar.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'Không có file nào được upload' 
            });
        }
        
        const userId = req.user.userId;
        
        // Đường dẫn tương đối để lưu vào cơ sở dữ liệu
        let avatarPath;
        if (process.env.NODE_ENV === 'production') {
            avatarPath = `avatars/${req.file.filename}`; // Cho production
        } else {
            avatarPath = `images/avatars/${req.file.filename}`; // Cho development
        }
        
        console.log('File đã upload:', req.file);
        console.log('Đường dẫn avatar sẽ lưu vào CSDL:', avatarPath);
        
        // Cập nhật cả hai trường AvatarUrl và ProfilePicture để đảm bảo tương thích
        await pool.query(
            'UPDATE Users SET AvatarUrl = ?, ProfilePicture = ? WHERE UserID = ?', 
            [avatarPath, avatarPath, userId]
        );
        
        // Lấy thông tin người dùng sau khi cập nhật
        const [userRows] = await pool.query(
            'SELECT UserID, FullName, Email, PhoneNumber, RoleID, AvatarUrl, ProfilePicture, Status, CreatedAt FROM Users WHERE UserID = ?',
            [userId]
        );
        
        const user = userRows[0];
        
        res.json({ 
            success: true, 
            message: 'Upload avatar thành công', 
            avatarUrl: avatarPath,
            user: user
        });
    } catch (err) {
        console.error('Lỗi khi upload avatar:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Lỗi server: ' + err.message 
        });
    }
});

/**
 * API: Đổi mật khẩu người dùng
 * Method: POST
 * Endpoint: /users/change-password
 */
router.post('/change-password', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { currentPassword, newPassword } = req.body;
        
        // Kiểm tra dữ liệu đầu vào
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng cung cấp đầy đủ mật khẩu hiện tại và mật khẩu mới'
            });
        }
        
        // Kiểm tra độ dài mật khẩu mới
        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Mật khẩu mới phải có ít nhất 6 ký tự'
            });
        }
        
        // Lấy thông tin người dùng từ database
        const [users] = await pool.query(
            'SELECT PasswordHash FROM Users WHERE UserID = ?',
            [userId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng'
            });
        }
        
        const user = users[0];
        
        // Kiểm tra mật khẩu hiện tại
        const passwordMatch = await bcrypt.compare(currentPassword, user.PasswordHash);
        
        if (!passwordMatch) {
            return res.status(400).json({
                success: false,
                message: 'Mật khẩu hiện tại không đúng'
            });
        }
        
        // Mã hóa mật khẩu mới
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
        
        // Cập nhật mật khẩu mới
        await pool.query(
            'UPDATE Users SET PasswordHash = ? WHERE UserID = ?',
            [hashedPassword, userId]
        );
        
        res.json({
            success: true,
            message: 'Đổi mật khẩu thành công'
        });
    } catch (err) {
        console.error('Lỗi khi đổi mật khẩu:', err);
        res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + err.message
        });
    }
});

/**
 * API: Lấy danh sách xe của người dùng
 * Method: GET
 * Endpoint: /vehicles/user
 */
router.get('/vehicles/user', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        // Lấy danh sách xe từ database
        const [vehicles] = await pool.query(
            'SELECT * FROM Vehicles WHERE UserID = ? AND IsDeleted = 0 ORDER BY CreatedAt DESC',
            [userId]
        );
        
        res.json({
            success: true,
            vehicles
        });
    } catch (err) {
        console.error('Lỗi khi lấy danh sách xe:', err);
        res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + err.message
        });
    }
});

/**
 * API: Lấy thông tin chi tiết của một xe
 * Method: GET
 * Endpoint: /vehicles/:id
 */
router.get('/vehicles/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const vehicleId = req.params.id;
        
        // Lấy thông tin xe từ database
        const [vehicles] = await pool.query(
            'SELECT * FROM Vehicles WHERE VehicleID = ?',
            [vehicleId]
        );
        
        if (vehicles.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy xe'
            });
        }
        
        const vehicle = vehicles[0];
        
        // Kiểm tra quyền sở hữu
        if (vehicle.UserID !== userId && req.user.role !== 1) {
            return res.status(403).json({
                success: false,
                message: 'Bạn không có quyền xem thông tin xe này'
            });
        }
        
        res.json({
            success: true,
            vehicle
        });
    } catch (err) {
        console.error('Lỗi khi lấy thông tin xe:', err);
        res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + err.message
        });
    }
});

/**
 * API: Thêm xe mới
 * Method: POST
 * Endpoint: /vehicles
 */
router.post('/vehicles', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { licensePlate, brand, model, year } = req.body;
        
        // Kiểm tra dữ liệu đầu vào
        if (!licensePlate || !brand || !model) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng cung cấp đầy đủ thông tin biển số, hãng xe và mẫu xe'
            });
        }
        
        // Kiểm tra biển số xe đã tồn tại chưa
        // ✅ THÊM: AND IsDeleted = 0
        const [existingVehicles] = await pool.query(
            'SELECT * FROM Vehicles WHERE LicensePlate = ? AND IsDeleted = 0',
            [licensePlate]
        );
        
        if (existingVehicles.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Biển số xe đã tồn tại trong hệ thống'
            });
        }
        
        // Thêm xe mới vào database
        const [result] = await pool.query(
            'INSERT INTO Vehicles (UserID, LicensePlate, Brand, Model, Year) VALUES (?, ?, ?, ?, ?)',
            [userId, licensePlate, brand, model, year || null]
        );
        
        res.status(201).json({
            success: true,
            message: 'Thêm xe mới thành công',
            vehicleId: result.insertId
        });
    } catch (err) {
        console.error('Lỗi khi thêm xe mới:', err);
        res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + err.message
        });
    }
});

/**
 * API: Cập nhật thông tin xe
 * Method: PUT
 * Endpoint: /vehicles/:id
 */
router.put('/vehicles/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const vehicleId = req.params.id;
        const { licensePlate, brand, model, year } = req.body;
        
        // Kiểm tra dữ liệu đầu vào
        if (!licensePlate || !brand || !model) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng cung cấp đầy đủ thông tin biển số, hãng xe và mẫu xe'
            });
        }
        
        // Kiểm tra xe có tồn tại không và thuộc về người dùng hiện tại
        const [existingVehicles] = await pool.query(
            'SELECT * FROM Vehicles WHERE VehicleID = ?',
            [vehicleId]
        );
        
        if (existingVehicles.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy xe'
            });
        }
        
        const vehicle = existingVehicles[0];
        
        // Kiểm tra quyền sở hữu
        if (vehicle.UserID !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Bạn không có quyền cập nhật thông tin xe này'
            });
        }
        
        // Kiểm tra biển số xe đã tồn tại chưa (nếu thay đổi biển số)
        if (licensePlate !== vehicle.LicensePlate) {
            const [duplicateCheck] = await pool.query(
                'SELECT * FROM Vehicles WHERE LicensePlate = ? AND VehicleID != ?',
                [licensePlate, vehicleId]
            );
            
            if (duplicateCheck.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Biển số xe đã tồn tại trong hệ thống'
                });
            }
        }
        
        // Cập nhật thông tin xe
        await pool.query(
            'UPDATE Vehicles SET LicensePlate = ?, Brand = ?, Model = ?, Year = ? WHERE VehicleID = ?',
            [licensePlate, brand, model, year || null, vehicleId]
        );
        
        res.json({
            success: true,
            message: 'Cập nhật thông tin xe thành công'
        });
    } catch (err) {
        console.error('Lỗi khi cập nhật thông tin xe:', err);
        res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + err.message
        });
    }
});

/**
 * API: Xóa xe (Soft Delete)
 * Method: DELETE
 * Endpoint: /vehicles/:id
 */
router.delete('/vehicles/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const vehicleId = req.params.id;
        
        console.log(`🗑️ Soft deleting vehicle ${vehicleId} for user ${userId}`);
        
        // ✅ THÊM: IsDeleted = 0 để chỉ check xe active
        const [existingVehicles] = await pool.query(
            'SELECT * FROM Vehicles WHERE VehicleID = ? AND IsDeleted = 0',
            [vehicleId]
        );
        
        if (existingVehicles.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy xe'
            });
        }
        
        const vehicle = existingVehicles[0];
        
        // Kiểm tra quyền sở hữu
        if (vehicle.UserID !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Bạn không có quyền xóa xe này'
            });
        }
        
        // ✅ SỬA: Status NOT IN để loại cả Completed
        const [appointments] = await pool.query(
            'SELECT * FROM Appointments WHERE VehicleID = ? AND Status NOT IN ("Canceled", "Completed")',
            [vehicleId]
        );
        
        if (appointments.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa xe đang có lịch hẹn chưa hoàn thành'
            });
        }
        
        // ✅ ĐỔI: DELETE → UPDATE (SOFT DELETE)
        await pool.query(
            'UPDATE Vehicles SET IsDeleted = 1 WHERE VehicleID = ?',
            [vehicleId]
        );
        
        console.log(`✅ Vehicle ${vehicleId} soft deleted successfully`);
        
        res.json({
            success: true,
            message: 'Xóa xe thành công'
        });
    } catch (err) {
        console.error('Lỗi khi xóa xe:', err);
        res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + err.message
        });
    }
});

module.exports = router;