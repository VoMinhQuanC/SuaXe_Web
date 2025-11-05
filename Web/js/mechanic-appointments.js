// mechanic-appointments.js - JavaScript cho trang quản lý lịch hẹn của kỹ thuật viên

document.addEventListener('DOMContentLoaded', function() {
    // Sử dụng API_CONFIG từ config.js (được load trước)
    const API_BASE_URL = window.API_CONFIG ? window.API_CONFIG.BASE_URL : 'http://localhost:3001/api';
    
    // Lưu trữ dữ liệu
    let mechanicData = {};
    let appointments = [];
    let dataTable = null;
    let selectedAppointmentId = null;
    
    // Kiểm tra xác thực kỹ thuật viên
    checkMechanicAuth();
    
    // Tải dữ liệu ban đầu
    loadAppointments();
    
    // Đăng ký sự kiện
    document.getElementById('refreshAppointmentsBtn').addEventListener('click', refreshAppointments);
    document.getElementById('applyFilterBtn').addEventListener('click', applyFilter);
    document.getElementById('todayBtn').addEventListener('click', () => filterByDate('today'));
    document.getElementById('tomorrowBtn').addEventListener('click', () => filterByDate('tomorrow'));
    document.getElementById('thisWeekBtn').addEventListener('click', () => filterByDate('thisWeek'));
    document.getElementById('updateAppointmentBtn').addEventListener('click', updateAppointment);
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
            
            console.log("Auth check successful. User role:", user.role);
            console.log("User data:", user);
            
        } catch (error) {
            console.error('Lỗi phân tích dữ liệu người dùng:', error);
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
        }
    }
    
    /**
     * Tải danh sách lịch hẹn
     */
    async function loadAppointments(filters = {}) {
        try {
            const token = localStorage.getItem('token');
            
            if (!token) {
                throw new Error('Không có token xác thực');
            }
            
            console.log("Starting to load appointments with token:", token.substring(0, 15) + "...");
            
            // Hiển thị trạng thái đang tải
            document.getElementById('appointmentsList').innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-3">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Đang tải...</span>
                        </div>
                        <p class="mt-2">Đang tải danh sách lịch hẹn...</p>
                    </td>
                </tr>
            `;
            
            // Xây dựng URL với các tham số lọc
            let url = `${API_BASE_URL}/mechanics/appointments`;
            const queryParams = [];
            
            if (filters.status) {
                queryParams.push(`status=${encodeURIComponent(filters.status)}`);
            }
            
            if (filters.date) {
                queryParams.push(`date=${encodeURIComponent(filters.date)}`);
            }
            
            if (filters.dateFrom) {
                queryParams.push(`dateFrom=${encodeURIComponent(filters.dateFrom)}`);
            }
            
            if (filters.dateTo) {
                queryParams.push(`dateTo=${encodeURIComponent(filters.dateTo)}`);
            }
            
            if (queryParams.length > 0) {
                url += `?${queryParams.join('&')}`;
            }
            
            console.log("Fetching appointments from:", url);
            
            // Gọi API để lấy danh sách lịch hẹn
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log("Response status:", response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error("API Error response:", errorText);
                throw new Error(`Lỗi HTTP: ${response.status} - ${errorText}`);
            }
            
            const data = await response.json();
            console.log("API Response data:", data);
            
            if (data.success) {
                // Lưu danh sách lịch hẹn
                appointments = data.appointments || [];
                console.log("Loaded appointments:", appointments.length);
                
                // Hiển thị danh sách lịch hẹn
                renderAppointmentsTable(appointments);
            } else {
                throw new Error(data.message || 'Không thể tải danh sách lịch hẹn');
            }
            
        } catch (error) {
            console.error('Lỗi khi tải danh sách lịch hẹn:', error);
            
            document.getElementById('appointmentsList').innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-danger">
                        <i class="bi bi-exclamation-triangle me-2"></i>
                        Lỗi: ${error.message}
                    </td>
                </tr>
            `;
            
            showError('Không thể tải danh sách lịch hẹn: ' + error.message);
        }
    }
    
    /**
     * Hiển thị danh sách lịch hẹn trong bảng
     */
    function renderAppointmentsTable(appointmentsData) {
        if (!appointmentsData || appointmentsData.length === 0) {
            document.getElementById('appointmentsList').innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-3">
                        <i class="bi bi-calendar-x me-2"></i>
                        Không có lịch hẹn nào
                    </td>
                </tr>
            `;
            return;
        }
        
        console.log("Rendering appointments table with data:", appointmentsData);
        
        // Hủy DataTable cũ nếu đã tồn tại
        if (dataTable) {
            dataTable.destroy();
        }
        
        // Chuẩn bị dữ liệu cho DataTable
        const tableData = appointmentsData.map(appointment => {
            // Format ngày giờ
            const appointmentDate = new Date(appointment.AppointmentDate);
            const formattedDate = appointmentDate.toLocaleDateString('vi-VN') + ' ' + 
                                 appointmentDate.toLocaleTimeString('vi-VN', {
                                     hour: '2-digit',
                                     minute: '2-digit'
                                 });
            
            // Tạo badge trạng thái
            let statusBadge = '';
            
            switch (appointment.Status) {
                case 'Pending':
                    statusBadge = '<span class="badge bg-pending">Chờ xác nhận</span>';
                    break;
                case 'Confirmed':
                    statusBadge = '<span class="badge bg-confirmed">Đã xác nhận</span>';
                    break;
                case 'InProgress':
                    statusBadge = '<span class="badge bg-in-progress">Đang thực hiện</span>';
                    break;
                case 'Completed':
                    statusBadge = '<span class="badge bg-completed">Hoàn thành</span>';
                    break;
                case 'Canceled':
                    statusBadge = '<span class="badge bg-canceled">Đã hủy</span>';
                    break;
                default:
                    statusBadge = '<span class="badge bg-secondary">Không xác định</span>';
            }
            
            // Tạo nút thao tác
            const actionButtons = `
                <button class="btn btn-sm btn-primary btn-action" onclick="viewAppointmentDetail(${appointment.AppointmentID})">
                    <i class="bi bi-eye me-1"></i> Chi tiết
                </button>
            `;
            
            return [
                appointment.AppointmentID,
                appointment.CustomerName || appointment.FullName || 'Không có tên',
                appointment.PhoneNumber || 'N/A',
                appointment.Services || 'Không có dịch vụ',
                formattedDate,
                statusBadge,
                actionButtons
            ];
        });
        
        // Khởi tạo DataTable
        dataTable = $('#appointmentsTable').DataTable({
            data: tableData,
            columns: [
                { title: 'Mã' },
                { title: 'Khách hàng' },
                { title: 'SĐT' },
                { title: 'Dịch vụ' },
                { title: 'Ngày giờ' },
                { title: 'Trạng thái' },
                { title: 'Thao tác' }
            ],
            language: {
                url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/vi.json'
            },
            responsive: true,
            ordering: true,
            searching: true,
            lengthMenu: [10, 25, 50, 100],
            pageLength: 10
        });
        
        // Đặt hàm xử lý sự kiện cho nút xem chi tiết
        window.viewAppointmentDetail = viewAppointmentDetail;
    }
    
    /**
     * Xem chi tiết lịch hẹn
     */
    async function viewAppointmentDetail(appointmentId) {
        try {
            const token = localStorage.getItem('token');
            
            if (!token) {
                throw new Error('Không có token xác thực');
            }
            
            // Lưu ID lịch hẹn đang xem
            selectedAppointmentId = appointmentId;
            
            console.log("Fetching appointment detail for ID:", appointmentId);
            
            // Gọi API để lấy chi tiết lịch hẹn
            const response = await fetch(`${API_BASE_URL}/mechanics/appointments/${appointmentId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log("Detail response status:", response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error("API Error response:", errorText);
                throw new Error(`Lỗi HTTP: ${response.status} - ${errorText}`);
            }
            
            const data = await response.json();
            console.log("Appointment detail data:", data);
            
            if (data.success) {
                const appointment = data.appointment;
                
                // Điền thông tin cơ bản vào modal
                document.getElementById('appointmentId').textContent = appointment.AppointmentID;
                document.getElementById('customerName').textContent = appointment.FullName || 'Không có thông tin';
                document.getElementById('customerEmail').textContent = appointment.Email || 'Không có thông tin';
                document.getElementById('customerPhone').textContent = appointment.PhoneNumber || 'Không có thông tin';
                document.getElementById('vehiclePlate').textContent = appointment.LicensePlate || 'Không có thông tin';
                document.getElementById('vehicleBrand').textContent = appointment.Brand || 'Không có thông tin';
                document.getElementById('vehicleModel').textContent = appointment.Model || 'Không có thông tin';
                
                // Format ngày giờ
                const appointmentDate = new Date(appointment.AppointmentDate);
                const formattedDate = appointmentDate.toLocaleDateString('vi-VN') + ' ' + 
                                     appointmentDate.toLocaleTimeString('vi-VN', {
                                         hour: '2-digit',
                                         minute: '2-digit'
                                     });
                
                document.getElementById('appointmentDateTime').textContent = formattedDate;
                
                // Hiển thị trạng thái hiện tại
                let statusText = '';
                let statusClass = '';
                
                switch (appointment.Status) {
                    case 'Pending':
                        statusText = 'Chờ xác nhận';
                        statusClass = 'text-warning';
                        break;
                    case 'Confirmed':
                        statusText = 'Đã xác nhận';
                        statusClass = 'text-info';
                        break;
                    case 'InProgress':
                        statusText = 'Đang thực hiện';
                        statusClass = 'text-primary';
                        break;
                    case 'Completed':
                        statusText = 'Hoàn thành';
                        statusClass = 'text-success';
                        break;
                    case 'Canceled':
                        statusText = 'Đã hủy';
                        statusClass = 'text-danger';
                        break;
                    default:
                        statusText = 'Không xác định';
                        statusClass = 'text-secondary';
                }
                
                document.getElementById('currentStatus').innerHTML = `<span class="${statusClass}">${statusText}</span>`;
                
                // Format thời gian tạo
                const createdAt = new Date(appointment.CreatedAt);
                const formattedCreatedAt = createdAt.toLocaleDateString('vi-VN') + ' ' + 
                                         createdAt.toLocaleTimeString('vi-VN', {
                                             hour: '2-digit',
                                             minute: '2-digit'
                                         });
                
                document.getElementById('createdAt').textContent = formattedCreatedAt;
                
                // Điền giá trị vào form cập nhật
                document.getElementById('appointmentStatus').value = appointment.Status;
                document.getElementById('appointmentNotes').value = appointment.Notes || '';
                
                // Hiển thị danh sách dịch vụ
                const servicesList = document.getElementById('servicesList');
                
                if (appointment.services && appointment.services.length > 0) {
                    let servicesHTML = '';
                    let totalEstimatedTime = 0;
                    let totalPrice = 0;
                    
                    appointment.services.forEach(service => {
                        totalEstimatedTime += service.EstimatedTime || 0;
                        totalPrice += service.Price || 0;
                        
                        servicesHTML += `
                            <li class="list-group-item d-flex justify-content-between align-items-center">
                                <div>
                                    <div class="service-name">${service.ServiceName}</div>
                                    <div class="service-time">${service.EstimatedTime} phút</div>
                                </div>
                                <div class="service-price">${formatCurrency(service.Price)}</div>
                            </li>
                        `;
                    });
                    
                    servicesList.innerHTML = servicesHTML;
                    document.getElementById('totalTime').textContent = formatTime(totalEstimatedTime);
                    document.getElementById('totalPrice').textContent = formatCurrency(totalPrice);
                } else {
                    servicesList.innerHTML = '<li class="list-group-item">Không có dịch vụ nào</li>';
                    document.getElementById('totalTime').textContent = '0 phút';
                    document.getElementById('totalPrice').textContent = formatCurrency(0);
                }
                
                // Hiển thị modal
                const modal = new bootstrap.Modal(document.getElementById('appointmentDetailModal'));
                modal.show();
            } else {
                throw new Error(data.message || 'Không thể tải chi tiết lịch hẹn');
            }
            
        } catch (error) {
            console.error('Lỗi khi tải chi tiết lịch hẹn:', error);
            showError('Không thể tải chi tiết lịch hẹn: ' + error.message);
        }
    }
    
    /**
     * Cập nhật trạng thái lịch hẹn
     */
    async function updateAppointment() {
        try {
            const token = localStorage.getItem('token');
            
            if (!token || !selectedAppointmentId) {
                throw new Error('Không có thông tin cần thiết');
            }
            
            // Lấy dữ liệu từ form
            const status = document.getElementById('appointmentStatus').value;
            const notes = document.getElementById('appointmentNotes').value;
            
            console.log("Updating appointment:", selectedAppointmentId);
            console.log("New status:", status);
            console.log("Notes:", notes);
            
            // Hiển thị trạng thái đang cập nhật
            const updateBtn = document.getElementById('updateAppointmentBtn');
            const updateSpinner = document.getElementById('updateSpinner');
            updateBtn.disabled = true;
            updateSpinner.classList.remove('d-none');
            
            // Gọi API để cập nhật trạng thái lịch hẹn
            const response = await fetch(`${API_BASE_URL}/mechanics/appointments/${selectedAppointmentId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    status,
                    notes
                })
            });
            
            console.log("Update response status:", response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error("API Error response:", errorText);
                throw new Error(`Lỗi HTTP: ${response.status} - ${errorText}`);
            }
            
            const data = await response.json();
            console.log("Update response data:", data);
            
            if (data.success) {
                // Đóng modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('appointmentDetailModal'));
                modal.hide();
                
                // Hiển thị thông báo thành công
                showSuccess('Cập nhật trạng thái lịch hẹn thành công');
                
                // Tải lại danh sách lịch hẹn
                refreshAppointments();
            } else {
                throw new Error(data.message || 'Không thể cập nhật trạng thái lịch hẹn');
            }
            
        } catch (error) {
            console.error('Lỗi khi cập nhật trạng thái lịch hẹn:', error);
            showError('Không thể cập nhật trạng thái lịch hẹn: ' + error.message);
        } finally {
            // Khôi phục trạng thái nút
            const updateBtn = document.getElementById('updateAppointmentBtn');
            const updateSpinner = document.getElementById('updateSpinner');
            updateBtn.disabled = false;
            updateSpinner.classList.add('d-none');
        }
    }
    
    /**
     * Áp dụng bộ lọc
     */
    function applyFilter() {
        const status = document.getElementById('statusFilter').value;
        const dateFrom = document.getElementById('dateFromFilter').value;
        const dateTo = document.getElementById('dateToFilter').value;
        
        const filters = {};
        
        if (status) {
            filters.status = status;
        }
        
        if (dateFrom) {
            filters.dateFrom = dateFrom;
        }
        
        if (dateTo) {
            filters.dateTo = dateTo;
        }
        
        console.log("Applying filters:", filters);
        loadAppointments(filters);
    }
    
    /**
     * Lọc theo ngày
     */
    function filterByDate(dateType) {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const thisWeekStart = new Date(today);
        thisWeekStart.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1)); // Lấy thứ 2
        
        const thisWeekEnd = new Date(thisWeekStart);
        thisWeekEnd.setDate(thisWeekStart.getDate() + 6); // Lấy chủ nhật
        
        // Format dạng YYYY-MM-DD
        const formatDate = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        
        switch (dateType) {
            case 'today':
                // Reset filters
                document.getElementById('statusFilter').value = '';
                document.getElementById('dateFromFilter').value = formatDate(today);
                document.getElementById('dateToFilter').value = formatDate(today);
                break;
            case 'tomorrow':
                // Reset filters
                document.getElementById('statusFilter').value = '';
                document.getElementById('dateFromFilter').value = formatDate(tomorrow);
                document.getElementById('dateToFilter').value = formatDate(tomorrow);
                break;
            case 'thisWeek':
                // Reset filters
                document.getElementById('statusFilter').value = '';
                document.getElementById('dateFromFilter').value = formatDate(thisWeekStart);
                document.getElementById('dateToFilter').value = formatDate(thisWeekEnd);
                break;
        }
        
        // Áp dụng bộ lọc
        applyFilter();
    }
    
    /**
     * Làm mới danh sách lịch hẹn
     */
    function refreshAppointments() {
        // Reset các bộ lọc
        document.getElementById('statusFilter').value = '';
        document.getElementById('dateFromFilter').value = '';
        document.getElementById('dateToFilter').value = '';
        
        // Tải lại danh sách lịch hẹn
        loadAppointments();
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
     * Format tiền tệ (VND)
     */
    function formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
        }).format(amount);
    }
    
    /**
     * Format thời gian
     */
    function formatTime(minutes) {
        if (minutes < 60) {
            return `${minutes} phút`;
        } else {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            
            if (remainingMinutes === 0) {
                return `${hours} giờ`;
            } else {
                return `${hours} giờ ${remainingMinutes} phút`;
            }
        }
    }
});