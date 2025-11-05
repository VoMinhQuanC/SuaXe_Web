// mechanic-schedule.js - JavaScript cho trang lịch làm việc kỹ thuật viên

document.addEventListener('DOMContentLoaded', function() {
    // Sử dụng API_CONFIG từ config.js (được load trước)
    const API_BASE_URL = window.API_CONFIG ? window.API_CONFIG.BASE_URL : 'http://localhost:3001/api';
    
    // Lưu trữ dữ liệu
    let mechanicData = {};
    let schedules = [];
    let appointments = [];
    let selectedDate = null;
    let isEditMode = false;
    let selectedScheduleId = null;
    
    // Kiểm tra xác thực kỹ thuật viên
    checkMechanicAuth();
    
    // Khởi tạo lịch
    initializeCalendar();
    
    // Tải dữ liệu ban đầu
    loadScheduleData();
    
    // Đăng ký sự kiện
    document.getElementById('addScheduleBtn').addEventListener('click', openAddScheduleModal);
    document.getElementById('refreshScheduleBtn').addEventListener('click', refreshScheduleData);
    document.getElementById('saveScheduleBtn').addEventListener('click', saveSchedule);
    document.getElementById('confirmDeleteScheduleBtn').addEventListener('click', deleteSchedule);
    document.getElementById('viewAllSchedulesBtn').addEventListener('click', viewAllSchedules);
    document.getElementById('logout-link').addEventListener('click', logout);
    document.getElementById('sidebar-logout').addEventListener('click', logout);
    
    /**
     * Kiểm tra xác thực kỹ thuật viên
     */
    function checkMechanicAuth() {
        const token = localStorage.getItem('token');
        const userInfo = localStorage.getItem('user');
        
        if (!token || !userInfo) {
            // Chưa đăng nhập, chuyển hướng đến trang đăng nhập
            window.location.href = 'login.html';
            return;
        }
        
        try {
            const user = JSON.parse(userInfo);
            
            // Kiểm tra vai trò kỹ thuật viên (role = 3)
            if (user.role !== 3) {
                // Không phải kỹ thuật viên, chuyển hướng đến trang chủ
                alert('Bạn không có quyền truy cập trang kỹ thuật viên');
                window.location.href = 'index.html';
                return;
            }
            
            // Lưu thông tin kỹ thuật viên
            mechanicData = user;
            
            // Hiển thị tên kỹ thuật viên
            document.getElementById('mechanicName').textContent = user.fullName || 'Kỹ thuật viên';
            
            // Hiển thị avatar với chữ cái đầu tiên của tên
            if (user.fullName) {
                document.getElementById('avatarPlaceholder').textContent = user.fullName.charAt(0).toUpperCase();
            }
            
        } catch (error) {
            console.error('Lỗi phân tích dữ liệu người dùng:', error);
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
        }
    }
    
    /**
     * Khởi tạo FullCalendar
     */
    function initializeCalendar() {
        const calendarEl = document.getElementById('calendar');
        
        if (!calendarEl) return;
        
        const calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'timeGridWeek',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
            },
            locale: 'vi',
            buttonText: {
                today: 'Hôm nay',
                month: 'Tháng',
                week: 'Tuần',
                day: 'Ngày',
                list: 'Danh sách'
            },
            firstDay: 1, // Thứ 2 là ngày đầu tuần
            allDaySlot: false,
            slotMinTime: '07:00:00',
            slotMaxTime: '22:00:00',
            slotDuration: '00:30:00',
            navLinks: true,
            editable: false,
            selectable: true,
            selectMirror: true,
            dayMaxEvents: true,
            nowIndicator: true,
            slotEventOverlap: false,
            eventTimeFormat: {
                hour: '2-digit',
                minute: '2-digit',
                meridiem: false,
                hour12: false
            },
            select: function(info) {
                handleDateSelection(info.start, info.end);
            },
            eventClick: function(info) {
                handleEventClick(info.event);
            },
            dateClick: function(info) {
                handleDateClick(info.date);
            }
        });
        
        calendar.render();
        
        // Lưu tham chiếu toàn cục đến calendar
        window.schedulesCalendar = calendar;
    }
    
    /**
     * Tải dữ liệu lịch làm việc và lịch hẹn
     */
    async function loadScheduleData() {
        try {
            const token = localStorage.getItem('token');
            
            if (!token) {
                throw new Error('Không có token xác thực');
            }
            
            // Tải lịch làm việc
            await loadMechanicSchedules();
            
            // Tải lịch hẹn
            await loadMechanicAppointments();
            
            // Cập nhật sự kiện trên lịch
            updateCalendarEvents();
            
        } catch (error) {
            console.error('Lỗi khi tải dữ liệu lịch làm việc:', error);
            showError('Không thể tải dữ liệu lịch làm việc: ' + error.message);
        }
    }
    
    /**
     * Tải lịch làm việc của kỹ thuật viên
     */
    async function loadMechanicSchedules() {
        try {
            const token = localStorage.getItem('token');
            
            // Hiển thị trạng thái đang tải
            document.getElementById('schedulesList').innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-3">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Đang tải...</span>
                        </div>
                        <p class="mt-2">Đang tải lịch làm việc...</p>
                    </td>
                </tr>
            `;
            
            // Gọi API để lấy lịch làm việc
            const response = await fetch(`${API_BASE_URL}/mechanics/schedules`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`Lỗi HTTP: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                // Lưu lịch làm việc
                schedules = data.schedules || [];
                
                // Hiển thị danh sách lịch làm việc
                renderSchedulesList(schedules);
            } else {
                throw new Error(data.message || 'Không thể tải lịch làm việc');
            }
            
        } catch (error) {
            console.error('Lỗi khi tải lịch làm việc:', error);
            
            document.getElementById('schedulesList').innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-danger">
                        <i class="bi bi-exclamation-triangle me-2"></i>
                        Lỗi: ${error.message}
                    </td>
                </tr>
            `;
        }
    }
    
    /**
     * Tải lịch hẹn của kỹ thuật viên
     */
    async function loadMechanicAppointments() {
        try {
            const token = localStorage.getItem('token');
            
            // Gọi API để lấy lịch hẹn
            const response = await fetch(`${API_BASE_URL}/mechanics/appointments`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`Lỗi HTTP: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                // Lưu lịch hẹn
                appointments = data.appointments || [];
            } else {
                throw new Error(data.message || 'Không thể tải lịch hẹn');
            }
            
        } catch (error) {
            console.error('Lỗi khi tải lịch hẹn:', error);
            showError('Không thể tải lịch hẹn: ' + error.message);
        }
    }
    
    /**
     * Hiển thị danh sách lịch làm việc
     */
    function renderSchedulesList(schedulesData) {
        const tableBody = document.getElementById('schedulesList');
        
        if (!schedulesData || schedulesData.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-3">
                        <i class="bi bi-calendar-x me-2"></i>
                        Bạn chưa đăng ký lịch làm việc nào
                    </td>
                </tr>
            `;
            return;
        }
        
        // Sắp xếp lịch làm việc theo thời gian bắt đầu mới nhất đến cũ nhất
        const sortedSchedules = [...schedulesData].sort((a, b) => {
            return new Date(b.StartTime) - new Date(a.StartTime);
        });
        
        // Giới hạn hiển thị 5 lịch gần nhất
        const recentSchedules = sortedSchedules.slice(0, 5);
        
        let html = '';
        
        recentSchedules.forEach(schedule => {
            // Format thời gian
            const startDate = new Date(schedule.StartTime);
            const endDate = new Date(schedule.EndTime);
            
            const formattedStartDate = startDate.toLocaleDateString('vi-VN') + ' ' + 
                                      startDate.toLocaleTimeString('vi-VN', {
                                          hour: '2-digit',
                                          minute: '2-digit'
                                      });
            
            const formattedEndDate = endDate.toLocaleDateString('vi-VN') + ' ' + 
                                    endDate.toLocaleTimeString('vi-VN', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    });
            
            // Tạo badge trạng thái
            let statusBadge = '';
            let statusClass = '';
            
            switch (schedule.Status) {
                case 'Approved':
                    statusBadge = 'Đã duyệt';
                    statusClass = 'bg-approved';
                    break;
                case 'Pending':
                    statusBadge = 'Chờ duyệt';
                    statusClass = 'bg-pending';
                    break;
                case 'Rejected':
                    statusBadge = 'Đã từ chối';
                    statusClass = 'bg-rejected';
                    break;
                default:
                    statusBadge = 'Không xác định';
                    statusClass = 'bg-secondary';
            }
            
            html += `
                <tr>
                    <td>${schedule.ScheduleID}</td>
                    <td>${formattedStartDate}</td>
                    <td>${formattedEndDate}</td>
                    <td><span class="badge ${statusClass}">${statusBadge}</span></td>
                    <td>${schedule.Notes || 'Không có ghi chú'}</td>
                    <td>
                        <button class="btn btn-sm btn-primary btn-action" onclick="editSchedule(${schedule.ScheduleID})">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-danger btn-action" onclick="confirmDeleteSchedule(${schedule.ScheduleID})">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        tableBody.innerHTML = html;
        
        // Đặt hàm xử lý sự kiện cho các nút
        window.editSchedule = editSchedule;
        window.confirmDeleteSchedule = confirmDeleteSchedule;
    }
    
    /**
     * Cập nhật sự kiện trên lịch
     */
    function updateCalendarEvents() {
        if (!window.schedulesCalendar) return;
        
        // Xóa tất cả sự kiện hiện tại
        window.schedulesCalendar.removeAllEvents();
        
        // Thêm lịch làm việc
        const scheduleEvents = schedules.map(schedule => {
            // Xác định màu sắc dựa trên loại lịch
            let className = 'bg-schedule';
            
            if (schedule.Type === 'unavailable') {
                className = 'bg-unavailable';
            }
            
            return {
                id: 'schedule-' + schedule.ScheduleID,
                title: schedule.Type === 'available' ? 'Lịch làm việc' : 'Không làm việc',
                start: schedule.StartTime,
                end: schedule.EndTime,
                className: className,
                extendedProps: {
                    type: 'schedule',
                    schedule: schedule
                }
            };
        });
        
        // Thêm lịch hẹn
        const appointmentEvents = appointments.map(appointment => {
            return {
                id: 'appointment-' + appointment.AppointmentID,
                title: 'Lịch hẹn: ' + (appointment.CustomerName || 'Khách hàng'),
                start: appointment.AppointmentDate,
                end: new Date(new Date(appointment.AppointmentDate).getTime() + 60 * 60 * 1000), // Thêm 1 giờ
                className: 'bg-appointment',
                extendedProps: {
                    type: 'appointment',
                    appointment: appointment
                }
            };
        });
        
        // Thêm tất cả sự kiện vào lịch
        window.schedulesCalendar.addEventSource(scheduleEvents);
        window.schedulesCalendar.addEventSource(appointmentEvents);
    }
    
    /**
     * Xử lý khi chọn một khoảng thời gian trên lịch
     */
    function handleDateSelection(start, end) {
        // Lưu ngày được chọn
        selectedDate = start;
        
        // Mở modal đăng ký lịch với thời gian đã chọn
        openAddScheduleModal(start, end);
    }
    
    /**
     * Xử lý khi nhấp vào một ngày trên lịch
     */
    function handleDateClick(date) {
        // Lưu ngày được chọn
        selectedDate = date;
        
        // Có thể thêm hành động khác ở đây nếu cần
    }
    
    /**
     * Xử lý khi nhấp vào một sự kiện trên lịch
     */
    function handleEventClick(event) {
        const eventData = event.extendedProps;
        
        if (eventData.type === 'schedule') {
            // Mở modal chỉnh sửa lịch làm việc
            editSchedule(eventData.schedule.ScheduleID);
        } else if (eventData.type === 'appointment') {
            // Hiển thị thông tin lịch hẹn
            alert('Lịch hẹn: ' + event.title);
            // Có thể mở modal chi tiết lịch hẹn ở đây
        }
    }
    
    /**
     * Mở modal thêm lịch làm việc mới
     */
    function openAddScheduleModal(start = null, end = null) {
        // Reset form
        document.getElementById('scheduleForm').reset();
        document.getElementById('scheduleId').value = '';
        
        // Cập nhật tiêu đề modal
        document.getElementById('scheduleModalLabel').textContent = 'Đăng ký lịch làm việc mới';
        
        // Nếu có thời gian đã chọn, điền vào form
        if (start && end) {
            const startDate = new Date(start);
            const endDate = new Date(end);
            
            // Điền ngày
            document.getElementById('scheduleDate').value = formatDateForInput(startDate);
            
            // Điền giờ bắt đầu và kết thúc
            document.getElementById('startTime').value = formatTimeForInput(startDate);
            document.getElementById('endTime').value = formatTimeForInput(endDate);
        } else {
            // Nếu không có thời gian đã chọn, mặc định là ngày hiện tại
            const now = new Date();
            const later = new Date(now.getTime() + 2 * 60 * 60 * 1000); // Sau 2 tiếng
            
            document.getElementById('scheduleDate').value = formatDateForInput(now);
            document.getElementById('startTime').value = formatTimeForInput(now);
            document.getElementById('endTime').value = formatTimeForInput(later);
        }
        
        // Đặt chế độ thêm mới
        isEditMode = false;
        selectedScheduleId = null;
        
        // Hiển thị modal
        const modal = new bootstrap.Modal(document.getElementById('scheduleModal'));
        modal.show();
    }
    
    /**
     * Mở modal chỉnh sửa lịch làm việc
     */
    function editSchedule(scheduleId) {
        // Tìm lịch làm việc trong danh sách
        const schedule = schedules.find(s => s.ScheduleID === scheduleId);
        
        if (!schedule) {
            showError('Không tìm thấy thông tin lịch làm việc');
            return;
        }
        
        // Lưu ID lịch đang chỉnh sửa
        selectedScheduleId = scheduleId;
        
        // Cập nhật tiêu đề modal
        document.getElementById('scheduleModalLabel').textContent = 'Chỉnh sửa lịch làm việc';
        
        // Điền thông tin vào form
        document.getElementById('scheduleId').value = schedule.ScheduleID;
        
        const startDate = new Date(schedule.StartTime);
        const endDate = new Date(schedule.EndTime);
        
        document.getElementById('scheduleDate').value = formatDateForInput(startDate);
        document.getElementById('startTime').value = formatTimeForInput(startDate);
        document.getElementById('endTime').value = formatTimeForInput(endDate);
        document.getElementById('scheduleType').value = schedule.Type || 'available';
        document.getElementById('scheduleNotes').value = schedule.Notes || '';
        
        // Đặt chế độ chỉnh sửa
        isEditMode = true;
        
        // Hiển thị modal
        const modal = new bootstrap.Modal(document.getElementById('scheduleModal'));
        modal.show();
    }
    
    /**
     * Lưu lịch làm việc (thêm mới hoặc cập nhật)
     */
    async function saveSchedule() {
        try {
            const token = localStorage.getItem('token');
            
            if (!token) {
                throw new Error('Không có token xác thực');
            }
            
            // Lấy dữ liệu từ form
            const scheduleDate = document.getElementById('scheduleDate').value;
            const startTime = document.getElementById('startTime').value;
            const endTime = document.getElementById('endTime').value;
            const scheduleType = document.getElementById('scheduleType').value;
            const notes = document.getElementById('scheduleNotes').value;
            
            // Validate dữ liệu
            if (!scheduleDate || !startTime || !endTime) {
                showError('Vui lòng điền đầy đủ thông tin ngày và giờ');
                return;
            }
            
            // Tạo đối tượng ngày từ input
            const startDateTime = new Date(`${scheduleDate}T${startTime}`);
            const endDateTime = new Date(`${scheduleDate}T${endTime}`);
            
            // Kiểm tra thời gian hợp lệ
            if (startDateTime >= endDateTime) {
                showError('Thời gian kết thúc phải sau thời gian bắt đầu');
                return;
            }
            
            // Kiểm tra thời gian làm việc tối thiểu (ví dụ: 30 phút)
            const minDuration = 30 * 60 * 1000; // 30 phút tính bằng mili giây
            if (endDateTime - startDateTime < minDuration) {
                showError('Thời gian làm việc tối thiểu là 30 phút');
                return;
            }
            
            // Hiển thị trạng thái đang lưu
            const saveBtn = document.getElementById('saveScheduleBtn');
            const saveSpinner = document.getElementById('saveScheduleSpinner');
            saveBtn.disabled = true;
            saveSpinner.classList.remove('d-none');
            
            // Chuẩn bị dữ liệu
            const scheduleData = {
                startTime: startDateTime.toISOString(),
                endTime: endDateTime.toISOString(),
                type: scheduleType,
                notes: notes
            };
            
            let response;
            
            if (isEditMode) {
                // Cập nhật lịch làm việc
                response = await fetch(`${API_BASE_URL}/mechanics/schedules/${selectedScheduleId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(scheduleData)
                });
            } else {
                // Thêm lịch làm việc mới
                response = await fetch(`${API_BASE_URL}/mechanics/schedules`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(scheduleData)
                });
            }
            
            if (!response.ok) {
                throw new Error(`Lỗi HTTP: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                // Đóng modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('scheduleModal'));
                modal.hide();
                
                // Hiển thị thông báo thành công
                showSuccess(isEditMode ? 'Cập nhật lịch làm việc thành công' : 'Đăng ký lịch làm việc thành công');
                
                // Tải lại dữ liệu
                await loadScheduleData();
            } else {
                throw new Error(data.message || 'Không thể lưu lịch làm việc');
            }
            
        } catch (error) {
            console.error('Lỗi khi lưu lịch làm việc:', error);
            showError('Không thể lưu lịch làm việc: ' + error.message);
        } finally {
            // Khôi phục trạng thái nút
            const saveBtn = document.getElementById('saveScheduleBtn');
            const saveSpinner = document.getElementById('saveScheduleSpinner');
            saveBtn.disabled = false;
            saveSpinner.classList.add('d-none');
        }
    }
    
    /**
     * Hiển thị modal xác nhận xóa lịch làm việc
     */
    function confirmDeleteSchedule(scheduleId) {
        // Lưu ID lịch cần xóa
        selectedScheduleId = scheduleId;
        
        // Hiển thị modal xác nhận
        const modal = new bootstrap.Modal(document.getElementById('deleteScheduleModal'));
        modal.show();
    }
    
    /**
     * Xóa lịch làm việc
     */
    async function deleteSchedule() {
        try {
            const token = localStorage.getItem('token');
            
            if (!token || !selectedScheduleId) {
                throw new Error('Không có thông tin cần thiết');
            }
            
            // Hiển thị trạng thái đang xóa
            const deleteBtn = document.getElementById('confirmDeleteScheduleBtn');
            const deleteSpinner = document.getElementById('deleteScheduleSpinner');
            deleteBtn.disabled = true;
            deleteSpinner.classList.remove('d-none');
            
            // Gọi API để xóa lịch làm việc
            const response = await fetch(`${API_BASE_URL}/mechanics/schedules/${selectedScheduleId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`Lỗi HTTP: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                // Đóng modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('deleteScheduleModal'));
                modal.hide();
                
                // Hiển thị thông báo thành công
                showSuccess('Xóa lịch làm việc thành công');
                
                // Tải lại dữ liệu
                await loadScheduleData();
            } else {
                throw new Error(data.message || 'Không thể xóa lịch làm việc');
            }
            
        } catch (error) {
            console.error('Lỗi khi xóa lịch làm việc:', error);
            showError('Không thể xóa lịch làm việc: ' + error.message);
        } finally {
            // Khôi phục trạng thái nút
            const deleteBtn = document.getElementById('confirmDeleteScheduleBtn');
            const deleteSpinner = document.getElementById('deleteScheduleSpinner');
            deleteBtn.disabled = false;
            deleteSpinner.classList.add('d-none');
        }
    }
    
    /**
     * Xem tất cả lịch làm việc
     */
    function viewAllSchedules() {
        // Tải tất cả lịch làm việc và hiển thị
        renderSchedulesList(schedules);
    }
    
    /**
     * Làm mới dữ liệu lịch làm việc
     */
    function refreshScheduleData() {
        loadScheduleData();
    }
    
    /**
     * Đăng xuất
     */
    function logout(e) {
        e.preventDefault();
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    }
    
    /**
     * Hiển thị thông báo lỗi
     */
    function showError(message) {
        const errorAlert = document.getElementById('errorAlert');
        const errorMessage = document.getElementById('errorMessage');
        
        errorMessage.textContent = message;
        errorAlert.classList.remove('d-none');
        
        // Tự động ẩn sau 5 giây
        setTimeout(() => {
            errorAlert.classList.add('d-none');
        }, 5000);
    }
    
    /**
     * Hiển thị thông báo thành công
     */
    function showSuccess(message) {
        const successAlert = document.getElementById('successAlert');
        const successMessage = document.getElementById('successMessage');
        
        successMessage.textContent = message;
        successAlert.classList.remove('d-none');
        
        // Tự động ẩn sau 5 giây
        setTimeout(() => {
            successAlert.classList.add('d-none');
        }, 5000);
    }
    
    /**
     * Format ngày cho input date
     */
    function formatDateForInput(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        return `${year}-${month}-${day}`;
    }
    
    /**
     * Format giờ cho input time
     */
    function formatTimeForInput(date) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${hours}:${minutes}`;
    }
});