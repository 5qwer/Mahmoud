import QRCode from 'qrcode';
import { Html5QrcodeScanner } from 'html5-qrcode';

class AttendanceApp {
    constructor() {
        this.students = JSON.parse(localStorage.getItem('students') || '[]');
        this.attendance = JSON.parse(localStorage.getItem('attendance') || '{}');
        this.grades = JSON.parse(localStorage.getItem('grades') || '{}');
        this.behavioralNotes = JSON.parse(localStorage.getItem('behavioralNotes') || '{}');
        this.palmTemplates = JSON.parse(localStorage.getItem('palmTemplates') || '{}');
        this.monthlyReports = JSON.parse(localStorage.getItem('monthlyReports') || '{}');
        this.lockedDays = JSON.parse(localStorage.getItem('lockedDays') || '[]');
        this.activityLog = JSON.parse(localStorage.getItem('activityLog') || '[]');
        this.adminPassword = localStorage.getItem('adminPassword') || '2468';
        this.lateTime = localStorage.getItem('lateTime') || '08:00';
        this.institutionName = localStorage.getItem('institutionName') || 'تطبيق طلاب مستر محمود حمد';

        const storedDate = localStorage.getItem('appCurrentDate');
        if (!storedDate) {
            this.currentDate = new Date().toISOString().split('T')[0];
            localStorage.setItem('appCurrentDate', this.currentDate);
        } else {
            this.currentDate = storedDate;
        }

        this.currentStudentProfile = null;
        this.audioContext = null;
        this.absentAlarmInterval = null;
        this.pendingAbsentContext = null;

        this.initializeApp();
        this.setupEventListeners();
        this.updateDisplay();
    }

    initializeApp() {
        this.loadInitialUI();
        document.documentElement.style.setProperty('--danger-color-rgb', '220, 38, 38');

        document.getElementById('cairo-date').textContent = 
            new Date().toLocaleDateString('ar-SA', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeIcon(savedTheme);

        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.protocol !== 'file:') {
            const warningMessage = 'تنبيه: أنت تستخدم التطبيق من بيئة غير آمنة (http). ميزات الكاميرا (QR وبصمة الكف) قد لا تعمل. للحصول على أفضل تجربة، استخدم التطبيق عبر رابط آمن (https) أو كتطبيق مخصص يطلب أذونات الكاميرا.';
            setTimeout(() => this.showNotification(warningMessage, 'warning', 10000), 1500);
        }

        if (this.students.length === 0) {
            this.addSampleData();
        }
    }

    loadInitialUI() {
        const modalsContainer = document.getElementById('modals-container');
        const modalsTemplate = document.getElementById('modals-template');
        modalsContainer.innerHTML = modalsTemplate.innerHTML;
    
        // Load initial tab content
        this.switchTab('attendance', true);
    }

    setupEventListeners() {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const button = e.target.closest('.nav-tab');
                if (button) {
                    this.switchTab(button.dataset.tab);
                }
            });
        });

        document.getElementById('theme-toggle').addEventListener('click', () => {
            this.toggleTheme();
        });

        // Use event delegation for dynamically loaded content
        document.body.addEventListener('click', (e) => {
            if (e.target.closest('#scan-btn')) this.handleScanButtonClick();
            if (e.target.closest('#scan-palm-btn')) this.startPalmVerification();
            if (e.target.closest('#mark-all-absent')) this.markAllAbsent();
            if (e.target.closest('#export-daily')) this.exportDailyReport();
            if (e.target.closest('#add-student-btn')) this.showAddStudentModal();
            if (e.target.closest('#import-students-btn')) this.importStudents();
            if (e.target.closest('#manual-entry-btn')) this.showManualEntryModal();
            if (e.target.closest('#export-students-qr-btn')) this.exportAllStudentQRs();
            if (e.target.closest('#generate-report')) this.generateReport();
            if (e.target.closest('#end-day-btn')) this.promptForPassword('endDay');
            if (e.target.closest('#start-new-day-btn')) this.promptForPassword('startNewDay');
            if (e.target.closest('#view-log-btn')) this.toggleActivityLog();
            if (e.target.closest('#clear-log-btn')) this.promptForPassword('clearLog');
            if (e.target.closest('#change-password-btn')) this.promptForPassword('changePassword');
            if (e.target.closest('#open-admin-settings-btn')) this.showAdminModal();
            if (e.target.matches('.btn-delete-note')) this.handleDeleteBehavioralNote(e.target);
            if (e.target.id === 'absent-alert-confirm') { /* Handled by promise in showAbsentAlert */ }
            if (e.target.id === 'absent-alert-cancel') { /* Handled by promise in showAbsentAlert */ }
        });

        document.body.addEventListener('change', (e) => {
             if (e.target.matches('#attendance-grade-filter, #attendance-group-filter')) {
                this.populateGradeAndGroupFilters(); 
                this.updateAttendanceDisplay();
            }
            if (e.target.matches('#students-grade-filter, #students-group-filter')) {
                this.populateGradeAndGroupFilters();
                this.displayStudents();
            }
            if (e.target.matches('#report-grade-filter, #report-group-filter')) {
                this.populateGradeAndGroupFilters();
            }
            if (e.target.matches('.note-input')) {
                const studentId = e.target.dataset.studentId;
                this.saveAttendanceNote(studentId, e.target.value);
            }
        });

        document.body.addEventListener('input', (e) => {
            if (e.target.matches('#student-code')) this.showStudentNamePreview(e.target.value.trim());
            if (e.target.matches('#search-students')) this.searchStudents(e.target.value);
            // تحديث قوائم الاقتراحات في نموذج الطالب عند فتحه
            if (e.target.matches('#new-student-class, #new-student-group')) {
                this.refreshDatalists();
            }
        });

        document.body.addEventListener('keypress', (e) => {
            if (e.target.matches('#student-code') && e.key === 'Enter') {
                this.markAttendance(e.target.value.trim());
            }
        });

        this.setupModalEventListeners();
    }

    setupModalEventListeners() {
        document.body.addEventListener('click', e => {
            // General modal closing
            if (e.target.matches('.modal')) e.target.classList.remove('show');
            if (e.target.matches('.close')) e.target.closest('.modal').classList.remove('show');
    
            // Specific button handlers
            if (e.target.id === 'cancel-add') this.hideAddStudentModal();
            if (e.target.id === 'confirm-add') this.addStudent();
            if (e.target.id === 'generate-code') this.generateStudentCode();
            
            if (e.target.matches('.qr-close')) this.hideQRScannerModal();
            if (e.target.id === 'download-qr-btn') this.downloadQR();
    
            if (e.target.matches('.scanner-close')) this.hideQRScannerModal();
    
            if (e.target.matches('.manual-close') || e.target.id === 'cancel-manual-entry') this.hideManualEntryModal();
            if (e.target.id === 'save-manual-entries') this.saveManualEntries();
            if (e.target.id === 'add-row') this.addTableRow();
            if (e.target.id === 'clear-table') this.clearEntryTable(true);
            if (e.target.id === 'auto-generate-codes') this.autoGenerateCodes();
            if (e.target.id === 'parse-bulk-input') this.parseBulkStudentData();
            if (e.target.id === 'clear-bulk-input') document.getElementById('bulk-student-input').value = '';
    
            if (e.target.matches('.password-close')) this.hidePasswordModal();
            if (e.target.id === 'confirm-password-btn') this.handlePasswordConfirmation();
            
            if (e.target.matches('.profile-close')) this.hideStudentProfileModal();
            if (e.target.id === 'add-grade-btn') this.showAddGradeModal();
            if (e.target.id === 'add-behavioral-note') this.addBehavioralNote();
            if (e.target.id === 'generate-monthly-report') this.generateMonthlyReport();
            if (e.target.id === 'export-monthly-report') this.exportMonthlyReportPDF();

            if (e.target.matches('.grade-close') || e.target.id === 'cancel-grade') this.hideAddGradeModal();
            if (e.target.id === 'save-grade') this.saveNewGrade();

            if (e.target.matches('.palm-enroll-close')) {
                this.hidePalmEnrollModal();
                this.stopVideoStream();
            }
            if (e.target.id === 'palm-retry-btn') this.handlePalmRetry();

            if (e.target.matches('.admin-close') || e.target.id === 'cancel-admin-settings') this.hideAdminModal();
            if (e.target.id === 'save-admin-settings') this.saveAdminSettings();

            // Confirm mark-all-absent modal close
            if (e.target.matches('.confirm-absent-close')) {
                document.getElementById('confirm-absent-modal').classList.remove('show');
                this.pendingAbsentContext = null;
            }
            if (e.target.id === 'confirm-absent-apply') this.applyPendingAbsent();

            // Convert today's absent to makeup from profile
            if (e.target.id === 'convert-absent-btn') {
                this.convertAbsentToMakeup(this.currentStudentProfile.id);
            }

            // Palm: camera/torch controls
            if (e.target.id === 'toggle-camera-btn') this.togglePalmCamera();
            if (e.target.id === 'toggle-torch-btn') this.toggleTorch();
        });
    }

    handleScanButtonClick() {
        // Initialize AudioContext on first user interaction
        this.initAudioContext();

        const code = document.getElementById('student-code').value.trim();
        if (code) {
            this.markAttendance(code);
        } else {
            this.startQRScanner();
        }
    }

    handlePasswordConfirmation() {
        const password = document.getElementById('admin-password-input').value;
        if (password !== this.adminPassword) {
            this.showNotification('كلمة المرور غير صحيحة!', 'error');
            return;
        }

        const action = document.getElementById('password-modal').dataset.action;
        this.hidePasswordModal();
        if (typeof this[action] === 'function') {
            this[action]();
        }
    }
    
    handlePalmRetry() {
        if(this.currentPalmAction === 'enroll') {
                this.simulateEnrollmentProcess(this.currentStudentProfile?.id);
        } else if (this.currentPalmAction === 'verify') {
            this.simulateVerificationProcess();
        }
    }

    handleDeleteBehavioralNote(target) {
        const noteItem = target.closest('.behavioral-note-item');
        const studentId = noteItem.dataset.studentId;
        const noteIndex = noteItem.dataset.noteIndex;
        if (studentId && noteIndex !== undefined) {
            this.deleteBehavioralNote(studentId, parseInt(noteIndex));
        }
    }

    switchTab(tabName, forceLoad = false) {
        const currentActiveTab = document.querySelector('.nav-tab.active');
        if (!forceLoad && currentActiveTab && currentActiveTab.dataset.tab === tabName) {
            return; // Don't reload if it's the same tab
        }

        document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        const tabContentEl = document.getElementById(`${tabName}-tab`);
        const templateEl = document.getElementById(`${tabName}-template`);
        
        if (tabContentEl && templateEl) {
            tabContentEl.innerHTML = templateEl.innerHTML;
            tabContentEl.classList.add('active');
        }

        if (tabName === 'attendance') {
            this.updateAttendanceDisplay();
            this.populateGradeAndGroupFilters();
        } else if (tabName === 'students') {
            // Ensure filters are populated before listing students
            this.populateGradeAndGroupFilters();
            this.displayStudents();
        } else if (tabName === 'reports') {
            const today = new Date();
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            document.getElementById('date-from').value = firstDay.toISOString().split('T')[0];
            document.getElementById('date-to').value = today.toISOString().split('T')[0];
            this.updateReportDisplay();
        } else if (tabName === 'admin') {
            this.displayActivityLog();
        }
    }

    startCairoTimeUpdate() {
        this.updateCairoTime();
        setInterval(() => {
            this.updateCairoTime();
        }, 1000);
    }

    updateCairoTime() {
        const now = new Date();
        const cairoTime = new Date(now.toLocaleString("en-US", {timeZone: "Africa/Cairo"}));

        const timeString = cairoTime.toLocaleString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });

        const dateString = cairoTime.toLocaleDateString('ar-SA', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const cairoTimeElement = document.getElementById('cairo-time');
        const cairoDateElement = document.getElementById('cairo-date');

        if (cairoTimeElement) cairoTimeElement.textContent = timeString;
        if (cairoDateElement) cairoDateElement.textContent = dateString;
    }

    checkMonthlyReset() {
        const today = new Date();
        const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const lastResetMonth = localStorage.getItem('lastResetMonth');

        if (lastResetMonth !== currentMonth) {
            this.performMonthlyReset(currentMonth);
            localStorage.setItem('lastResetMonth', currentMonth);
        }
    }

    performMonthlyReset(currentMonth) {
        this.archiveCurrentMonth(currentMonth);

        console.log(`Monthly reset performed for ${currentMonth}`);
        this.logActivity(`تم أرشفة بيانات الشهر السابق وبدء شهر جديد: ${this.getPreviousMonth(currentMonth)}`);
        this.showNotification('تم بدء شهر جديد - تم حفظة بيانات الشهر السابق في الأرشيف', 'success');
    }

    archiveCurrentMonth(currentMonth) {
        const previousMonth = this.getPreviousMonth(currentMonth);

        if (!this.monthlyReports[previousMonth]) {
            this.monthlyReports[previousMonth] = {};
        }

        this.students.forEach(student => {
            this.monthlyReports[previousMonth][student.id] = this.generateStudentMonthlyData(student.id, previousMonth);
        });

        this.saveData();
    }

    getPreviousMonth(currentMonth) {
        const [year, month] = currentMonth.split('-').map(Number);
        const prevDate = new Date(year, month - 2); 
        return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.updateThemeIcon(newTheme);
    }

    updateThemeIcon(theme) {
        const icon = document.querySelector('#theme-toggle i');
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }

    populateGradeAndGroupFilters() {
        const activeTab = document.querySelector('.nav-tab.active')?.dataset.tab || 'attendance';
        const prefix = activeTab === 'students' ? 'students' : activeTab === 'reports' ? 'report' : 'attendance';
        
        const gradeFilterId = `${prefix}-grade-filter`;
        const groupFilterId = `${prefix}-group-filter`;

        const gradeFilter = document.getElementById(gradeFilterId);
        const groupFilter = document.getElementById(groupFilterId);

        if (!gradeFilter) return;

        const grades = [...new Set(this.students.map(s => s.class).filter(Boolean))].sort();
        const currentGrade = gradeFilter.value;
        gradeFilter.innerHTML = '<option value="all">كل الصفوف</option>';
        grades.forEach(grade => {
            const option = document.createElement('option');
            option.value = grade;
            option.textContent = grade;
            gradeFilter.appendChild(option);
        });
        gradeFilter.value = currentGrade;

        if (!groupFilter) return;
        
        const selectedGrade = gradeFilter.value;
        const currentGroup = groupFilter.value;

        let studentsForGroups = this.students;
        if (selectedGrade !== 'all') {
            studentsForGroups = this.students.filter(s => s.class === selectedGrade);
        }

        const groups = [...new Set(studentsForGroups.map(s => s.group).filter(Boolean))].sort();
        groupFilter.innerHTML = '<option value="all">كل المجموعات</option>';
        groups.forEach(group => {
            const option = document.createElement('option');
            option.value = group;
            option.textContent = group;
            groupFilter.appendChild(option);
        });
        groupFilter.value = groups.includes(currentGroup) ? currentGroup : 'all';
    }

    showStudentNamePreview(code) {
        const previewEl = document.getElementById('student-name-preview');
        if (!code) {
            if (previewEl) previewEl.classList.remove('show');
            return;
        }

        const { grade, group } = this.getSelectedAttendanceContext();
        if (grade === 'all' || group === 'all') {
            if (previewEl) previewEl.classList.remove('show');
            return;
        }

        const student = this.students.find(s => s.code === code && s.class === grade && s.group === group);
        const studentInOtherGroup = this.students.find(s => s.code === code && s.class === grade && s.group !== group);

        if (student && previewEl) {
            previewEl.textContent = student.name;
            previewEl.classList.remove('show');
            previewEl.style.color = ''; 
            previewEl.classList.add('show');
        } else if (studentInOtherGroup && previewEl) {
            previewEl.textContent = `${studentInOtherGroup.name} (تعويض من ${studentInOtherGroup.group})`;
            previewEl.style.color = 'var(--warning-color)'; 
            previewEl.classList.add('show');
        } else if (previewEl) {
            previewEl.classList.remove('show');
            previewEl.style.color = ''; 
        }
    }

    async markAttendance(code, method = 'code') {
        const previewEl = document.getElementById('student-name-preview');
        const studentCodeInput = document.getElementById('student-code');

        const cleanup = () => {
            studentCodeInput.value = '';
            if (previewEl) {
                previewEl.classList.remove('show');
                previewEl.style.color = ''; 
            }
            studentCodeInput.focus();
        };

        if (!code) {
            this.showNotification('يرجى إدخال كود الطالب', 'warning');
            return;
        }

        const { grade: currentGrade, group: currentGroup } = this.getSelectedAttendanceContext();
        if (currentGrade === 'all' || currentGroup === 'all') {
            this.showNotification('يرجى اختيار الصف والمجموعة قبل تسجيل الحضور.', 'warning');
            return;
        }

        if (this.isDayLocked(this.currentDate)) {
            this.showNotification('هذا اليوم مغلق ولا يمكن تعديل الحضور.', 'error');
            return;
        }

        const studentInContext = this.students.find(s => s.code === code && s.class === currentGrade && s.group === currentGroup);
        const studentInOtherGroup = this.students.find(s => s.code === code && s.class === currentGrade && s.group !== currentGroup);

        const studentToMark = studentInContext || studentInOtherGroup;

        if (!studentToMark) {
            this.showNotification('لا يوجد طالب بهذا الكود في هذا الصف الدراسي.', 'error');
            cleanup();
            return;
        }
        
        const isMakeup = !!studentInOtherGroup && !studentInContext;

        if (!this.attendance[this.currentDate]) {
            this.attendance[this.currentDate] = {};
        }

        if (this.attendance[this.currentDate][studentToMark.id]?.status) {
            const existingStatus = this.attendance[this.currentDate][studentToMark.id].status;
             if (['present', 'late', 'makeup'].includes(existingStatus)) {
                this.showNotification(`${studentToMark.name} مسجل حضوره مسبقاً`, 'warning');
                cleanup();
                return;
            }
        }
        
        const now = new Date();
        const [hours, minutes] = this.lateTime.split(':').map(Number);
        const lateThreshold = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
        
        let status;
        let logMessage;
        let notificationMessage;

        if (isMakeup) {
            status = 'makeup';
            logMessage = `تم تسجيل حضور تعويض للطالب: ${studentToMark.name} (من مجموعة ${studentToMark.group}) في مجموعة ${currentGroup}`;
            notificationMessage = `تم تسجيل ${studentToMark.name} كـ "تعويض" من مجموعة (${studentToMark.group})`;
            this.playWarningSound();
        } else {
            status = now > lateThreshold ? 'late' : 'present';
            logMessage = `تم تسجيل ${status === 'late' ? 'تأخر' : 'حضور'} الطالب: ${studentToMark.name} (الكود: ${studentToMark.code}) في ${currentGrade} / ${currentGroup}`;
            notificationMessage = `تم تسجيل ${studentToMark.name} بنجاح`;
        }
        
        // إذا كان الطالب مسجل غياب في الحصة/اليوم السابق اعرض إنذار مستمر حتى يؤكد المستخدم
        const lastStatus = this.findLastStudentStatus(studentToMark.id);
        if (lastStatus === 'absent') {
            const proceed = await this.showAbsentAlert(studentToMark);
            if (!proceed) {
                // تراجع: لا نسجل شيء
                cleanup();
                return;
            }
            // لو أكد: نكمل التسجيل عادي
        }

        this.attendance[this.currentDate][studentToMark.id] = { 
            status, 
            method, 
            time: now.toTimeString().slice(0, 5),
            originalGroup: isMakeup ? studentToMark.group : null,
            attendedGroup: currentGroup,
        };

        this.saveData();
        this.logActivity(logMessage);
        this.showNotification(notificationMessage, isMakeup ? 'warning' : 'success');
        
        cleanup();
        this.updateDisplay();
    }

    markAllAbsent() {
        if (this.isDayLocked(this.currentDate)) {
            this.showNotification('هذا اليوم مغلق ولا يمكن تعديل الحضور.', 'error');
            return;
        }

        const { grade: currentGrade, group: currentGroup } = this.getSelectedAttendanceContext();

        // كوّن قائمة الطلاب المستهدفين وقت الضغط فقط
        let studentsToMark = this.students;
        if (currentGrade !== 'all') studentsToMark = studentsToMark.filter(s => s.class === currentGrade);
        if (currentGroup !== 'all') studentsToMark = studentsToMark.filter(s => s.group === currentGroup);

        // استبعد من لديهم سجل اليوم بالفعل
        const today = this.currentDate;
        const alreadyMarked = new Set(Object.keys(this.attendance[today] || {}));
        const targetIds = studentsToMark
            .filter(s => !alreadyMarked.has(s.id))
            .map(s => s.id);

        if (targetIds.length === 0) {
            this.showNotification('لا يوجد طلاب لتسجيل غيابهم في هذا النطاق.', 'warning');
            return;
        }

        // احفظ السياق حتى لو المستخدم غيّر الفلاتر قبل التأكيد
        this.pendingAbsentContext = {
            date: today,
            grade: currentGrade,
            group: currentGroup,
            targetIds
        };

        // اعرض رسالة التأكيد
        const msgEl = document.getElementById('confirm-absent-message');
        const scopeText = `${currentGrade !== 'all' ? currentGrade : 'كل الصفوف'} / ${currentGroup !== 'all' ? currentGroup : 'كل المجموعات'}`;
        msgEl.innerHTML = `هل تريد تأكيد تسجيل الغياب لـ <strong>${targetIds.length}</strong> طالب في النطاق: <strong>${scopeText}</strong>؟`;
        document.getElementById('confirm-absent-modal').classList.add('show');
    }

    applyPendingAbsent() {
        const modal = document.getElementById('confirm-absent-modal');
        if (!this.pendingAbsentContext) {
            modal.classList.remove('show');
            return;
        }

        const { date, targetIds, grade, group } = this.pendingAbsentContext;

        if (!this.attendance[date]) this.attendance[date] = {};
        let absentCount = 0;

        targetIds.forEach(id => {
            if (!this.attendance[date][id]) {
                this.attendance[date][id] = { status: 'absent', method: 'auto' };
                absentCount++;
            }
        });

        this.saveData();
        this.logActivity(`تم تسجيل غياب تلقائي لـ ${absentCount} طالب في ${grade} / ${group}`);
        this.showNotification(`تم تسجيل غياب ${absentCount} طالب`, 'success');

        modal.classList.remove('show');
        this.pendingAbsentContext = null;
        this.updateDisplay();
    }

    exportDailyReport() {
        const todayAttendance = this.attendance[this.currentDate] || {};
        const presentStudents = [];
        const absentStudents = [];

        this.students.forEach(student => {
            const record = todayAttendance[student.id];
            if (record?.status === 'present') {
                presentStudents.push(student);
            } else if (record?.status === 'absent') {
                absentStudents.push(student);
            }
        });

        const reportDate = new Date().toLocaleDateString('ar-SA');
        let csvContent = `تقرير الحضور ليوم ${reportDate}\n\n`;

        csvContent += "الطلاب الحاضرون:\n";
        csvContent += "الاسم,الكود,الصف\n";
        presentStudents.forEach(student => {
            csvContent += `${student.name},${student.code},${student.class || ''}\n`;
        });

        csvContent += "\nالطلاب الغائبون:\n";
        csvContent += "الاسم,الكود,الصف\n";
        absentStudents.forEach(student => {
            csvContent += `${student.name},${student.code},${student.class || ''}\n`;
        });

        csvContent += `\nإجمالي الحاضرين: ${presentStudents.length}\n`;
        csvContent += `إجمالي الغائبين: ${absentStudents.length}\n`;
        csvContent += `إجمالي الطلاب: ${this.students.length}\n`;
        csvContent += `نسبة الحضور: ${((presentStudents.length / this.students.length) * 100).toFixed(1)}%\n`;

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `تقرير_الحضور_${this.currentDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.logActivity('تم تصدير تقرير الحضور اليومي');
        this.showNotification('تم تصدير التقرير بنجاح', 'success');
    }

    showAddStudentModal(studentId = null) {
        const modal = document.getElementById('add-student-modal');
        const title = document.getElementById('student-modal-title');
        const confirmBtn = document.getElementById('confirm-add');

        document.getElementById('editing-student-id').value = '';
        document.getElementById('new-student-name').value = '';
        document.getElementById('new-student-code').value = '';
        document.getElementById('new-student-class').value = '';
        document.getElementById('new-student-group').value = '';
        document.getElementById('new-student-guardian-name').value = '';
        document.getElementById('new-student-guardian-phone').value = '';
        document.getElementById('new-student-status').value = 'عام';

        this.refreshDatalists();

        if (studentId) {
            const student = this.students.find(s => s.id === studentId);
            if (!student) return;

            title.textContent = 'تعديل بيانات الطالب';
            confirmBtn.textContent = 'حفظ التعديلات';

            document.getElementById('editing-student-id').value = student.id;
            document.getElementById('new-student-name').value = student.name;
            document.getElementById('new-student-code').value = student.code;
            document.getElementById('new-student-class').value = student.class || '';
            document.getElementById('new-student-group').value = student.group || '';
            document.getElementById('new-student-guardian-name').value = student.guardianName || '';
            document.getElementById('new-student-guardian-phone').value = student.guardianPhone || '';
            document.getElementById('new-student-status').value = student.status || 'عام';
        } else {
            title.textContent = 'إضافة طالب جديد';
            confirmBtn.textContent = 'إضافة';
        }

        modal.classList.add('show');
        document.getElementById('new-student-name').focus();
    }

    hideAddStudentModal() {
        const modal = document.getElementById('add-student-modal');
        modal.classList.remove('show');
    }

    generateStudentCode() {
        const code = Date.now().toString().slice(-4);
        document.getElementById('new-student-code').value = code;
    }

    addStudent() {
        const name = document.getElementById('new-student-name').value.trim();
        const code = document.getElementById('new-student-code').value.trim();
        const studentClass = document.getElementById('new-student-class').value.trim();
        const group = document.getElementById('new-student-group').value.trim();
        const guardianName = document.getElementById('new-student-guardian-name').value.trim();
        const guardianPhone = document.getElementById('new-student-guardian-phone').value.trim();
        const status = document.getElementById('new-student-status').value;
        const studentId = document.getElementById('editing-student-id').value;

        if (!name || !code) {
            this.showNotification('يرجى إدخال اسم الطالب والكود', 'warning');
            return;
        }
        if (!studentClass || !group) {
            this.showNotification('يجب تحديد الصف والمجموعة لكل طالب', 'warning');
            return;
        }

        if (studentId) {
            const student = this.students.find(s => s.id === studentId);
            if (!student) return;

            student.name = name;
            student.code = code;
            student.class = studentClass;
            student.group = group;
            student.guardianName = guardianName;
            student.guardianPhone = guardianPhone;
            student.status = status;

            this.saveData();
            this.hideAddStudentModal();
            this.logActivity(`تم تحديث بيانات الطالب: ${name} (الكود: ${code}) - ${studentClass} / ${group}`);
            this.showNotification(`تم تحديث بيانات ${name} بنجاح`, 'success');
        } else {
            const newStudent = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name,
                code,
                class: studentClass,
                group: group,
                guardianName: guardianName,
                guardianPhone: guardianPhone,
                status: status,
                createdAt: new Date().toISOString()
            };

            this.students.push(newStudent);
            this.saveData();
            this.hideAddStudentModal();
            this.logActivity(`تم إضافة طالب جديد: ${name} (الكود: ${code}) - ${studentClass} / ${group}`);
            this.showNotification(`تم إضافة الطالب ${name} بنجاح`, 'success');
        }

        this.updateDisplay();
    }

    deleteStudent(studentId) {
        if (confirm('هل أنت متأكد من حذف هذا الطالب؟ سيتم حذف جميع سجلات حضوره ودرجاته أيضاً.')) {
            const studentToDelete = this.students.find(s => s.id === studentId);
            const studentInfo = `الاسم: ${studentToDelete.name}, الكود: ${studentToDelete.code}`;

            this.students = this.students.filter(s => s.id !== studentId);

            Object.keys(this.attendance).forEach(date => {
                delete this.attendance[date][studentId];
            });

            delete this.grades[studentId];
            delete this.behavioralNotes[studentId];
            delete this.palmTemplates[studentId];

            this.saveData();
            this.logActivity(`تم حذف الطالب: ${studentInfo}`);
            this.showNotification('تم حذف الطالب بنجاح', 'success');
            this.updateDisplay();
        }
    }

    searchStudents(query) {
        const filteredStudents = this.students.filter(student =>
            student.name.toLowerCase().includes(query.toLowerCase()) ||
            student.code.toLowerCase().includes(query.toLowerCase()) ||
            (student.class && student.class.toLowerCase().includes(query.toLowerCase())) ||
            (student.group && student.group.toLowerCase().includes(query.toLowerCase()))
        );
        this.displayStudents(filteredStudents);
    }

    importStudents() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,.txt,.pdf';

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.type === 'application/pdf') {
                this.importFromPDF(file);
            } else {
                this.importFromCSV(file);
            }
        };

        input.click();
    }

    async importFromPDF(file) {
        try {
            this.showNotification('جاري قراءة ملف PDF...', 'warning');

            let pdfjsLib;
            const cdnUrls = [
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.js',
                'https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.min.js',
                'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.js'
            ];

            let loadSuccess = false;
            for (const url of cdnUrls) {
                try {
                    const response = await fetch(url);
                    if (response.ok) {
                        const script = document.createElement('script');
                        script.src = url;
                        script.onload = () => { loadSuccess = true; };
                        document.head.appendChild(script);

                        await new Promise((resolve, reject) => {
                            script.onload = resolve;
                            script.onerror = reject;
                            setTimeout(reject, 10000); 
                        });

                        if (window.pdfjsLib) {
                            pdfjsLib = window.pdfjsLib;
                            break;
                        }
                    }
                } catch (error) {
                    console.warn(`فشل في تحميل مكتبة قراءة PDF من ${url}:`, error);
                    continue;
                }
            }

            if (!pdfjsLib) {
                throw new Error('فشل في تحميل مكتبة قراءة PDF. يرجى التحقق من الاتصال بالإنترنت والمحاولة مرة أخرى');
            }

            const arrayBuffer = await file.arrayBuffer();

            const loadingTask = pdfjsLib.getDocument({
                data: arrayBuffer,
                useSystemFonts: true,
                disableFontFace: false,
                isEvalSupported: false,
                disableAutoFetch: true,
                disableStream: true,
                cMapUrl: 'https://unpkg.com/pdfjs-dist@4.0.379/cmaps/',
                cMapPacked: true,
                standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@4.0.379/standard_fonts/',
                verbosity: 0 
            });

            const pdf = await Promise.race([
                loadingTask.promise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('انتهت مهلة تحميل الملف')), 30000))
            ]);

            let fullText = '';
            let rawTextItems = [];
            const maxPages = Math.min(pdf.numPages, 50); 

            for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
                try {
                    const page = await pdf.getPage(pageNum);

                    const textContent = await page.getTextContent({
                        normalizeWhitespace: true,
                        disableCombineTextItems: false,
                        includeMarkedContent: false
                    });

                    if (textContent && textContent.items) {
                        textContent.items.forEach(item => {
                            if (item.str && typeof item.str === 'string') {
                                let text = item.str.trim();

                                text = text
                                    .replace(/ي/g, 'ي')
                                    .replace(/ك/g, 'ك') 
                                    .replace(/ة/g, 'ة')
                                    .replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\s\w\d\-_.,()]/g, ' ')
                                    .replace(/\s+/g, ' ')
                                    .trim();

                                if (text && text.length > 0) {
                                    rawTextItems.push({
                                        text: text,
                                        x: item.transform ? item.transform[4] : 0,
                                        y: item.transform ? item.transform[5] : 0,
                                        width: item.width || 0,
                                        height: item.height || 0,
                                        page: pageNum
                                    });
                                }
                            }
                        });

                        const pageText = textContent.items
                            .map(item => (item.str || '').trim())
                            .filter(text => text.length > 0)
                            .join(' ');

                        if (pageText && pageText.trim().length > 0) {
                            fullText += pageText + '\n';
                        }
                    }

                    if (pageNum % 5 === 0) {
                        this.showNotification(`جاري قراءة الصفحة ${pageNum} من ${maxPages}...`, 'warning');
                    }
                } catch (pageError) {
                    console.warn(`خطأ في قراءة الصفحة ${pageNum}:`, pageError);
                    continue;
                }
            }

            if (!fullText || fullText.trim().length === 0) {
                throw new Error('الملف فارغ أو لا يحتوي على نص قابل للقراءة. تأكد من أن الملف يحتوي على نص وليس صور فقط');
            }

            console.log('تم استخراج النص بنجاح:', fullText.substring(0, 200) + '...');
            this.processImportedData(fullText);
        } catch (error) {
            console.error('خطأ في استيراد ملف PDF:', error);

            let errorMessage = 'خطأ في قراءة ملف PDF';

            if (error.message.includes('Invalid PDF') || error.message.includes('invalid')) {
                errorMessage = 'الملف المحدد ليس ملف PDF صالح أو تالف';
            } else if (error.message.includes('فارغ') || error.message.includes('لا يحتوي')) {
                errorMessage = 'الملف لا يحتوي على نص قابل للقراءة. تأكد من أن الملف يحتوي على نص وليس صور فقط';
            } else if (error.message.includes('تحميل') || error.message.includes('network') || error.message.includes('fetch')) {
                errorMessage = 'خطأ في الاتصال بالإنترنت. يرجى التحقق من الاتصال والمحاولة مرة أخرى';
            } else if (error.message.includes('مكتبة')) {
                errorMessage = 'فشل في تحميل أدوات قراءة PDF. يرجى إعادة المحاولة';
            }

            this.showNotification(errorMessage, 'error');

            setTimeout(() => {
                if (confirm('فشل في قراءة ملف PDF. هل تريد إدخال البيانات يدوياً في جدول؟')) {
                    this.showManualEntryModal();
                }
            }, 2000);
        }
    }

    processImportedData(content) {
        if (!content || content.trim().length === 0) {
            this.showNotification('الملف فارغ أو لا يحتوي على بيانات قابلة للقراءة', 'warning');
            return;
        }

        const normalizedContent = content
            .replace(/ي/g, 'ي')
            .replace(/ك/g, 'ك') 
            .replace(/ة/g, 'ة')
            .replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\s\w\d\-_.,()]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const lines = normalizedContent.split('\n').filter(line => line.trim().length > 2);
        let imported = 0;
        let failed = 0;
        let skipped = 0;

        lines.forEach((line, index) => {
            const cleanLine = line.trim();
            if (!cleanLine || cleanLine.length < 3) {
                skipped++;
                return;
            }

            if (this.isHeaderLine(cleanLine)) {
                skipped++;
                return;
            }

            const studentData = this.extractStudentData(cleanLine);

            if (studentData.name && studentData.code && 
                studentData.name.length >= 2 && studentData.code.length >= 2) {

                if (this.students.some(s => s.code === studentData.code)) {
                    failed++;
                    return;
                }

                const newStudent = {
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    name: studentData.name.trim(),
                    code: studentData.code.trim(),
                    class: studentData.class || '',
                    group: '',
                    createdAt: new Date().toISOString()
                };

                this.students.push(newStudent);
                imported++;
            } else {
                failed++;
            }
        });

        if (imported > 0) {
            this.saveData();
            this.logActivity(`تم استيراد ${imported} طالب من ملف`);
            this.showNotification(`تم استيراد ${imported} طالب${failed > 0 ? ` (فشل ${failed} سطر${skipped > 0 ? ` وتم تجاهل ${skipped} سطر` : ''})` : ''}`, 'success');
            this.updateDisplay();
        } else {
            this.showNotification(`لم يتم استيراد أي طلاب. تأكد من صحة التنسيق. (فشل ${failed} سطر، تجاهل ${skipped} سطر)`, 'warning');
        }
    }

    isHeaderLine(line) {
        const lowerLine = line.toLowerCase();
        const irrelevantPatterns = [
            'اسم الطالب', 'كود الطالب', 'رقم الطالب', 'الصف', 'الفصل',
            'student name', 'student code', 'student id', 'class', 'grade',
            'تاريخ', 'date', 'صفحة', 'page',
            'المجموع', 'total', 'الإجمالي',
            'تقرير', 'report', 'نظام', 'system'
        ];

        return irrelevantPatterns.some(pattern => lowerLine.includes(pattern)) || 
               line.length < 5 || 
               /^[\d\s\-_.,()]+$/.test(line); 
    }

    extractStudentData(line) {
        let name = '';
        let code = '';
        let studentClass = '';

        const cleanLine = line
            .replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\s\w\d\-_.,()]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!cleanLine || cleanLine.length < 3) {
            return { name: '', code: '', class: '' };
        }

        const patterns = [
            /^([\u0600-\u06FF][\u0600-\u06FF\s]+?)\s+([A-Za-z0-9]{2,15})/,
            /^([A-Za-z0-9]{2,15})\s+([\u0600-\u06FF][\u0600-\u06FF\s]{1,30})/,
            /([\u0600-\u06FF][\u0600-\u06FF\s]{5,})\s+([A-Za-z0-9]{2,15})|([A-Za-z0-9]{2,15})[\s\-_,|]+([\u0600-\u06FF][\u0600-\u06FF\s]{1,30})/
        ];

        for (const pattern of patterns) {
            const match = cleanLine.match(pattern);
            if (match && match[1] && match[2]) {
                let part1 = match[1].trim();
                let part2 = match[2].trim();

                let nameStr, codeStr;

                if (/^[\u0600-\u06FF]/.test(part1)) { 
                    nameStr = part1;
                    codeStr = part2;
                } else { 
                    nameStr = part2;
                    codeStr = part1;
                }

                if (nameStr.length >= 2 && /[\u0600-\u06FF]{3,}/.test(nameStr)) {
                    const words = nameStr.split(' ').filter(word => word.length > 1);
                    if (words.length >= 2) {
                        name = nameStr;
                        break;
                    }
                }
            }
        }

        if (!name || !code) {
            const delimiters = ['\t', ',', '|', '  ', ' - ', ': ', ';'];
            for (const delimiter of delimiters) {
                if (cleanLine.includes(delimiter)) {
                    const parts = cleanLine.split(delimiter)
                        .map(s => s.trim())
                        .filter(s => s.length > 1);

                    if (parts.length >= 2) {
                        const arabicParts = parts.filter(p => /[\u0600-\u06FF]/.test(p));
                        const codeParts = parts.filter(p => /^[A-Za-z0-9]{2,}$/.test(p));

                        if (arabicParts.length > 0 && codeParts.length > 0) {
                            name = arabicParts[0].trim();
                            code = codeParts[0].trim();
                            break;
                        }
                    }
                }
            }
        }

        name = name
            .replace(/[^\u0600-\u06FF\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        code = code.replace(/[^A-Za-z0-9]/g, '').trim();

        return { name, code, class: studentClass };
    }

    generateReport() {
        const fromDateStr = document.getElementById('date-from').value;
        const toDateStr = document.getElementById('date-to').value;
        const gradeFilter = document.getElementById('report-grade-filter').value;
        const groupFilter = document.getElementById('report-group-filter').value;

        if (!fromDateStr || !toDateStr) {
            this.showNotification('يرجى تحديد الفترة الزمنية', 'warning');
            return;
        }

        let filteredStudents = this.students;
        if (gradeFilter !== 'all') {
            filteredStudents = filteredStudents.filter(s => s.class === gradeFilter);
        }
        if (groupFilter !== 'all') {
            filteredStudents = filteredStudents.filter(s => s.group === groupFilter);
        }
        
        const container = document.getElementById('report-results');
        container.innerHTML = ''; 

        if (filteredStudents.length === 0) {
            container.innerHTML = '<p class="no-data-message">لا يوجد طلاب في الصف والمجموعة المحددة لعرض تقريرهم.</p>';
            return;
        }

        const startDate = new Date(fromDateStr);
        const endDate = new Date(toDateStr);

        const reportData = [];
        
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const attendanceForDay = this.attendance[dateStr] || {};
            
            filteredStudents.forEach(student => {
                const record = attendanceForDay[student.id];
                if (record) { 
                    let statusText = 'لم يسجل';
                    if (record.status === 'present') statusText = 'حاضر';
                    else if (record.status === 'late') statusText = 'متأخر';
                    else if (record.status === 'absent') statusText = 'غائب';
                    else if (record.status === 'makeup') statusText = 'تعويض';

                    reportData.push({
                        date: dateStr,
                        studentName: student.name,
                        studentCode: student.code,
                        studentClass: student.class || 'غير محدد',
                        studentGroup: student.group || 'غير محدد',
                        status: statusText,
                        statusRaw: record.status || '',
                        originalGroup: record.originalGroup || '',
                        attendedGroup: record.attendedGroup || '',
                        time: record.time || '--',
                        note: record.note || ''
                    });
                }
            });
        }
        
        this.displayDetailedReport(reportData);
    }

    displayDetailedReport(data) {
        const container = document.getElementById('report-results');
        
        if (data.length === 0) {
            container.innerHTML = '<p class="no-data-message">لا توجد بيانات حضور في الفترة المحددة لهذه المجموعة من الطلاب.</p>';
            return;
        }

        data.sort((a, b) => new Date(b.date) - new Date(a.date));

        let html = `
            <div class="detailed-report-actions">
                <button class="btn btn-success" onclick="app.exportReport('excel')">
                    <i class="fas fa-file-excel"></i> تحميل Excel
                </button>
                <button class="btn btn-danger" onclick="app.exportReport('pdf')">
                    <i class="fas fa-file-pdf"></i> تحميل PDF
                </button>
                <button class="btn btn-secondary" onclick="app.exportReport('csv')">
                    <i class="fas fa-file-csv"></i> تحميل CSV
                </button>
            </div>
            <div class="detailed-report-table-container">
                <table id="detailed-report-table">
                    <thead>
                        <tr>
                            <th>التاريخ</th>
                            <th>اسم الطالب</th>
                            <th>الكود</th>
                            <th>الصف</th>
                            <th>المجموعة</th>
                            <th>الحالة</th>
                            <th>من مجموعة</th>
                            <th>إلى مجموعة</th>
                            <th>الوقت</th>
                            <th>ملاحظات</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.forEach(row => {
            const fromGroup = row.statusRaw === 'makeup' ? (row.originalGroup || row.studentGroup || '') : '';
            const toGroup = row.statusRaw === 'makeup' ? (row.attendedGroup || row.studentGroup || '') : '';
            html += `
                <tr>
                    <td>${row.date}</td>
                    <td>${row.studentName}</td>
                    <td>${row.studentCode}</td>
                    <td>${row.studentClass}</td>
                    <td>${row.studentGroup}</td>
                    <td>${row.status}</td>
                    <td>${fromGroup}</td>
                    <td>${toGroup}</td>
                    <td>${row.time}</td>
                    <td>${row.note}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;
        container.innerHTML = html;
        container.dataset.reportData = JSON.stringify(data);
    }

    exportReport(format) {
        const reportDataStr = document.getElementById('report-results').dataset.reportData;
        if (!reportDataStr) {
            this.showNotification('لا توجد بيانات لتصديرها. يرجى إنشاء تقرير أولاً.', 'warning');
            return;
        }
        
        const data = JSON.parse(reportDataStr);
        const headers = {
            date: 'التاريخ',
            studentName: 'اسم الطالب',
            studentCode: 'الكود',
            studentClass: 'الصف',
            studentGroup: 'المجموعة',
            status: 'الحالة',
            fromGroup: 'من مجموعة',
            toGroup: 'إلى مجموعة',
            time: 'الوقت',
            note: 'ملاحظات'
        };

        const exportData = data.map(row => ({
            [headers.date]: row.date,
            [headers.studentName]: row.studentName,
            [headers.studentCode]: row.studentCode,
            [headers.studentClass]: row.studentClass,
            [headers.studentGroup]: row.studentGroup,
            [headers.status]: row.status,
            [headers.fromGroup]: row.statusRaw === 'makeup' ? (row.originalGroup || row.studentGroup || '') : '',
            [headers.toGroup]: row.statusRaw === 'makeup' ? (row.attendedGroup || row.studentGroup || '') : '',
            [headers.time]: row.time,
            [headers.note]: row.note,
        }));

        const fromDate = document.getElementById('date-from').value;
        const toDate = document.getElementById('date-to').value;
        const filename = `تقرير_${this.institutionName.replace(/\s/g, '_')}_${fromDate}_الى_${toDate}`;

        switch (format) {
            case 'excel':
                this.exportExcel(exportData, `${filename}.xlsx`);
                break;
            case 'pdf':
                this.exportPDF(Object.keys(headers).map(k => headers[k]), data, `${filename}.pdf`);
                break;
            case 'csv':
                this.exportCSV(exportData, `${filename}.csv`);
                break;
        }
    }

    exportExcel(data, filename) {
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'التقرير');
        XLSX.writeFile(workbook, filename);
        this.logActivity(`تم تصدير تقرير Excel: ${filename}`);
        this.showNotification('تم تصدير ملف Excel بنجاح', 'success');
    }

    exportPDF(headers, data, filename) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });
        
        doc.addFont('https://fonts.gstatic.com/s/notosansarabic/v17/nwpxtLGrO2xbwGLiMN_bAMft9Zt7c9z48Q.ttf', 'NotoSansArabic', 'normal');
        doc.setFont('NotoSansArabic');

        doc.setFontSize(16);
        doc.text(`تقرير الحضور والغياب - ${this.institutionName}`, 14, 16);
        
        const tableData = data.map(row => [
            row.date,
            row.studentName,
            row.studentCode,
            row.studentClass,
            row.studentGroup,
            row.status,
            row.statusRaw === 'makeup' ? (row.originalGroup || row.studentGroup || '') : '',
            row.statusRaw === 'makeup' ? (row.attendedGroup || row.studentGroup || '') : '',
            row.time,
            row.note,
        ]);
        
        doc.autoTable({
            head: [headers],
            body: tableData,
            startY: 30,
            styles: { font: 'NotoSansArabic', halign: 'center' },
            headStyles: { fillColor: [37, 99, 235] }, 
            didDrawPage: function(data) {
                 doc.setFontSize(10);
                 doc.setTextColor(150);
                 doc.text(`صفحة ${doc.internal.getNumberOfPages()}`, data.settings.margin.left, doc.internal.pageSize.height - 10);
            }
        });
        
        doc.save(filename);
        this.logActivity(`تم تصدير تقرير PDF: ${filename}`);
        this.showNotification('تم تصدير ملف PDF بنجاح', 'success');
    }

    exportCSV(data, filename) {
        const worksheet = XLSX.utils.json_to_sheet(data);
        const csvContent = "\uFEFF" + XLSX.utils.sheet_to_csv(worksheet); 
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.logActivity(`تم تصدير تقرير CSV: ${filename}`);
        this.showNotification('تم تصدير ملف CSV بنجاح', 'success');
    }

    updateDisplay() {
        this.updateAttendanceDisplay();
        if (document.getElementById('students-tab').classList.contains('active')) {
            this.displayStudents();
        }
        this.populateGradeAndGroupFilters();
    }

    updateAttendanceDisplay() {
        const { grade, group } = this.getSelectedAttendanceContext();
        const todayAttendance = this.attendance[this.currentDate] || {};

        let filteredStudents = this.students;
        if (grade !== 'all') {
            filteredStudents = filteredStudents.filter(s => s.class === grade);
        }
        if (group !== 'all') {
            filteredStudents = filteredStudents.filter(s => s.group === group);
        }

        const totalStudentsInContext = (grade === 'all' || group === 'all') ? this.students.length : filteredStudents.length;

        let presentCount = 0;
        let lateCount = 0;

        filteredStudents.forEach(student => {
            const record = todayAttendance[student.id];
            if (record) {
                if (record.status === 'present') presentCount++;
                else if (record.status === 'late') lateCount++;
            }
        });
        
        const totalAttended = presentCount + lateCount;
        const absentCount = totalStudentsInContext - totalAttended;

        document.getElementById('present-count').textContent = presentCount;
        document.getElementById('late-count').textContent = lateCount;
        document.getElementById('absent-count').textContent = absentCount >= 0 ? absentCount : 0;
        document.getElementById('total-students').textContent = totalStudentsInContext;

        this.displayAttendanceRecords(todayAttendance, grade, group);
    }

    displayAttendanceRecords(todayAttendance, gradeFilter = 'all', groupFilter = 'all') {
        const container = document.getElementById('attendance-records');
        
        let studentsInContext = this.students.filter(s => {
            if (gradeFilter !== 'all' && s.class !== gradeFilter) return false;
            if (groupFilter !== 'all' && s.group !== groupFilter) return false;
            return true;
        });

        const makeupAttendees = [];
        if (groupFilter !== 'all') { 
            Object.keys(todayAttendance).forEach(studentId => {
                const record = todayAttendance[studentId];
                const student = this.students.find(s => s.id === studentId);
                if (student && record.status === 'makeup' && record.attendedGroup === groupFilter && !studentsInContext.some(s => s.id === studentId)) {
                    makeupAttendees.push(student);
                }
            });
        }
        
        const allStudentsForDisplay = [...studentsInContext, ...makeupAttendees];
        
        if (allStudentsForDisplay.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">لا يوجد طلاب مطابقون لمعايير الفلترة.</p>';
            return;
        }

        requestAnimationFrame(() => {
            const fragment = document.createDocumentFragment();
            const sortedStudents = allStudentsForDisplay.sort((a, b) => {
                const statusA = todayAttendance[a.id]?.status || 'pending';
                const statusB = todayAttendance[b.id]?.status || 'pending';
                const order = { late: 0, present: 1, makeup: 2, absent: 3, pending: 4 };
                
                const orderA = order[statusA] ?? 99;
                const orderB = order[statusB] ?? 99;

                if (orderA !== orderB) {
                    return orderA - orderB;
                }
                return a.name.localeCompare(b.name, 'ar');
            });

            sortedStudents.forEach(student => {
                const record = todayAttendance[student.id];
                const status = record?.status || 'pending';
                const method = record?.method || 'none';
                const time = record?.time || '';
                const note = record?.note || '';

                let statusClass, statusIcon, statusText, timeText, methodIcon, makeupInfo = '';

                switch(status) {
                    case 'present':
                        statusClass = 'status-present';
                        statusIcon = 'fa-check';
                        statusText = 'حاضر';
                        break;
                    case 'late':
                        statusClass = 'status-late';
                        statusIcon = 'fa-clock';
                        statusText = 'متأخر';
                        break;
                    case 'absent':
                         statusClass = 'status-absent';
                         statusIcon = 'fa-times';
                         statusText = 'غائب';
                         break;
                    case 'makeup':
                        statusClass = 'status-makeup';
                        statusIcon = 'fa-exchange-alt';
                        statusText = `تعويض`;
                        if (record.attendedGroup !== student.group) { 
                             if (student.group === groupFilter) { 
                                 makeupInfo = `<span class="makeup-info">(في: ${record.attendedGroup})</span>`;
                             } else { 
                                 makeupInfo = `<span class="makeup-info">(من: ${record.originalGroup})</span>`;
                             }
                        }
                        break;
                    default: 
                        statusClass = 'status-pending';
                        statusIcon = 'fa-hourglass-start';
                        statusText = 'لم يسجل';
                }

                timeText = time ? `<span class="time">(${time})</span>` : '';
                methodIcon = '';

                if (status === 'present' || status === 'late' || status === 'makeup') {
                    switch(method) {
                        case 'qr': methodIcon = `<i class="fas fa-qrcode attendance-method-icon" title="تم التسجيل عبر QR"></i>`; break;
                        case 'palm': methodIcon = `<i class="fas fa-hand-paper attendance-method-icon" title="تم التسجيل عبر بصمة الكف"></i>`; break;
                        case 'code': methodIcon = `<i class="fas fa-keyboard attendance-method-icon" title="تم التسجيل عبر الكود"></i>`; break;
                    }
                }

                const isLocked = this.isDayLocked(this.currentDate);
                const disabledAttr = isLocked ? 'disabled' : '';

                const recordHtml = `
                    <div class="attendance-record">
                        <div class="attendance-record-main">
                            <div class="student-info">
                                <h4>${student.name}</h4>
                                <div class="student-meta">
                                    <span><i class="fas fa-id-card"></i> ${student.code}</span>
                                    ${student.group ? `<span><i class="fas fa-users"></i> ${student.group}</span>` : ''}
                                </div>
                            </div>
                            <div class="attendance-status ${statusClass}">
                                <i class="fas ${statusIcon}"></i>
                                ${statusText}
                                ${makeupInfo}
                                ${timeText}
                                ${methodIcon}
                            </div>
                        </div>
                        <div class="attendance-record-details">
                            <div class="note-entry">
                                <i class="fas fa-sticky-note"></i>
                                <input 
                                    type="text" 
                                    class="note-input" 
                                    placeholder="إضافة ملاحظة..." 
                                    value="${note}" 
                                    onchange="app.saveAttendanceNote('${student.id}', this.value)"
                                    ${disabledAttr}
                                >
                            </div>
                        </div>
                        ${isLocked ? '<div class="day-locked-badge"><i class="fas fa-lock"></i> اليوم مغلق</div>' : ''}
                    </div>
                `;

                const recordElement = document.createElement('div');
                recordElement.innerHTML = recordHtml;
                fragment.appendChild(recordElement.firstElementChild);
            });

            container.innerHTML = '';
            container.appendChild(fragment);
        });
    }

    saveData() {
        localStorage.setItem('students', JSON.stringify(this.students));
        localStorage.setItem('attendance', JSON.stringify(this.attendance));
        localStorage.setItem('grades', JSON.stringify(this.grades));
        localStorage.setItem('behavioralNotes', JSON.stringify(this.behavioralNotes));
        localStorage.setItem('palmTemplates', JSON.stringify(this.palmTemplates));
        localStorage.setItem('monthlyReports', JSON.stringify(this.monthlyReports));
        localStorage.setItem('lockedDays', JSON.stringify(this.lockedDays));
        localStorage.setItem('activityLog', JSON.stringify(this.activityLog));
        localStorage.setItem('adminPassword', this.adminPassword);
        localStorage.setItem('lateTime', this.lateTime);
        localStorage.setItem('institutionName', this.institutionName);
        localStorage.setItem('appCurrentDate', this.currentDate);
    }

    addSampleData() {
        const sampleStudents = [
            { id: '1', name: 'أحمد محمد علي', code: '101', class: 'الصف الأول الثانوي', group: 'مجموعة السبت', createdAt: new Date().toISOString(), guardianName: 'محمد علي', guardianPhone: '01012345678', status: 'عام' },
            { id: '2', name: 'فاطمة أحمد السيد', code: '102', class: 'الصف الأول الثانوي', group: 'مجموعة السبت', createdAt: new Date().toISOString(), guardianName: 'أحمد السيد', guardianPhone: '01112345678', status: 'عام' },
            { id: '3', name: 'محمود صالح خالد', code: '201', class: 'الصف الثاني الثانوي', group: 'مجموعة الأحد', createdAt: new Date().toISOString(), guardianName: 'صالح خالد', guardianPhone: '01212345678', status: 'عام' },
            { id: '4', name: 'عائشة عبدالله محمد', code: '202', class: 'الصف الثاني الثانوي', group: 'مجموعة الأحد', createdAt: new Date().toISOString(), guardianName: 'عبدالله محمد', guardianPhone: '01098765432', status: 'عام' },
            { id: '5', name: 'يوسف حسن أحمد', code: '301', class: 'الصف الثالث الثانوي', group: 'مجموعة الاثنين', createdAt: new Date().toISOString(), guardianName: 'حسن أحمد', guardianPhone: '01198765432', status: 'عام' },
            { id: '6', name: 'مريم خالد إبراهيم', code: '302', class: 'الصف الثالث الثانوي', group: 'مجموعة الاثنين', createdAt: new Date().toISOString(), guardianName: 'خالد إبراهيم', guardianPhone: '01551234567', status: 'خاص' }
        ];

        this.students = sampleStudents;
        this.saveData();
    }

    showManualEntryModal() {
        const modal = document.getElementById('manual-entry-modal');
        modal.classList.add('show');

        this.clearEntryTable(false); 
        for (let i = 0; i < 5; i++) {
            this.addTableRow();
        }
    }

    hideManualEntryModal() {
        const modal = document.getElementById('manual-entry-modal');
        modal.classList.remove('show');
    }

    addTableRow(data = {}) {
        const tbody = document.getElementById('entry-table-body');
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" class="student-name" value="${data.name || ''}" placeholder="اسم الطالب"></td>
            <td><input type="text" class="student-code" value="${data.code || ''}" placeholder="كود الطالب"></td>
            <td><input type="text" class="student-class" value="${data.class || ''}" placeholder="الصف"></td>
            <td><input type="text" class="student-group" value="${data.group || ''}" placeholder="المجموعة"></td>
            <td><input type="text" class="student-guardian-name" value="${data.guardianName || ''}" placeholder="اسم ولي الأمر"></td>
            <td><input type="tel" class="student-guardian-phone" value="${data.guardianPhone || ''}" placeholder="هاتف ولي الأمر"></td>
            <td>
                <select class="student-status">
                    <option value="عام" ${ (data.status || 'عام') === 'عام' ? 'selected' : '' }>عام</option>
                    <option value="خاص" ${ data.status === 'خاص' ? 'selected' : '' }>خاص</option>
                </select>
            </td>
            <td>
                <button class="delete-row-btn" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        
        tbody.appendChild(row);
        
        const nameInput = row.querySelector('.student-name');
        if (!data.name) {
            nameInput.focus();
        }
    }

    clearEntryTable(confirmFirst = true) {
        if (confirmFirst && !confirm('هل أنت متأكد من مسح جميع البيانات في الجدول؟')) {
            return;
        }
        document.getElementById('entry-table-body').innerHTML = '';
    }

    autoGenerateCodes() {
        const rows = document.querySelectorAll('#entry-table-body tr');
        let codeCounter = 1;

        rows.forEach(row => {
            const codeInput = row.querySelector('.student-code');
            const nameInput = row.querySelector('.student-name');

            if (nameInput.value.trim() && !codeInput.value.trim()) {
                codeInput.value = String(codeCounter);
                codeCounter++;
            }
        });

        this.showNotification('تم إنشاء الأكواد التلقائية للطلاب الذين لا يملكون أكواد', 'success');
    }

    parseBulkStudentData() {
        const text = document.getElementById('bulk-student-input').value.trim();
        if (!text) {
            this.showNotification('يرجى لصق بيانات الطلاب أولاً.', 'warning');
            return;
        }

        const lines = text.split('\n').filter(line => line.trim().length > 2);
        this.clearEntryTable(false); 

        let parsedCount = 0;
        let failedLines = [];

        lines.forEach((line, index) => {
            const studentData = this.parseStudentLine(line);
            if (studentData.name || studentData.code) {
                this.addTableRow(studentData);
                parsedCount++;
            } else {
                failedLines.push(index + 1);
            }
        });

        if (parsedCount > 0) {
            let message = `تم تحليل وإضافة ${parsedCount} طالب إلى الجدول.`;
            if (failedLines.length > 0) {
                message += ` فشل تحليل الأسطر: ${failedLines.join(', ')}.`;
            }
            this.showNotification(message, 'success');
        } else {
            this.showNotification('لم يتم التعرف على أي بيانات طلاب. يرجى مراجعة التنسيق.', 'error');
        }
    }

    parseStudentLine(line) {
        let remainingLine = ` ${line.trim()} `;

        const studentData = {
            name: '',
            code: '',
            class: '',
            group: '',
            guardianPhone: '',
            guardianName: '',
            status: 'عام'
        };

        const phoneRegex = /(?:رقم ولي الامر|رقم الهاتف|هاتف ولي الامر|تليفون ولي الامر|هاتف)\s*:?\s*(\d{10,12})/gi;
        let phoneMatch;
        while ((phoneMatch = phoneRegex.exec(remainingLine)) !== null) {
            studentData.guardianPhone = phoneMatch[1];
            remainingLine = remainingLine.replace(phoneMatch[0], ' ');
        }
        
        const classRegex = /(الصف\s+(?:[\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+)*))/gi;
        const classMatch = classRegex.exec(remainingLine);
        if (classMatch) {
            studentData.class = classMatch[1].trim();
            remainingLine = remainingLine.replace(classMatch[0], ' ');
        }

        const groupRegex = /((?:مجموعة|مجموعه)\s+[\u0600-\u06FF\s]+|السبت|الاحد|الإثنين|الثلاثاء|الاربعاء|الخميس|الجمعة)/gi;
        const groupMatch = groupRegex.exec(remainingLine);
        if (groupMatch) {
            studentData.group = groupMatch[1].trim();
            remainingLine = remainingLine.replace(groupMatch[0], ' ');
        }
        
        let cleanLine = remainingLine.replace(/[.,\-_:]/g, ' ').replace(/\s+/g, ' ').trim();
        const parts = cleanLine.split(' ');

        const nameParts = [];
        let foundCode = false;

        parts.forEach(part => {
            if (!foundCode && /^\d{2,5}$/.test(part)) {
                studentData.code = part;
                foundCode = true;
            } else if (/[\u0600-\u06FF]/.test(part)) { 
                nameParts.push(part);
            }
        });
        
        studentData.name = nameParts.join(' ');
        
        studentData.name = studentData.name
            .replace(/[^\u0600-\u06FF\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        studentData.code = studentData.code.replace(/[^A-Za-z0-9]/g, '').trim();

        return studentData;
    }

    saveManualEntries() {
        const rows = document.querySelectorAll('#entry-table-body tr');
        const newStudents = [];
        const errors = [];
        let duplicateCodes = 0;

        const hasExistingData = this.students.length > 0;
        let clearExisting = false;

        if (hasExistingData) {
            clearExisting = confirm('هل تريد حذف البيانات الموجودة واستبدالها بالبيانات الجديدة؟\n\nاختر "موافق" للاستبدال أو "إلغاء" للإضافة إلى البيانات الموجودة');
        }

        if (clearExisting) {
            this.students = [];
        }

        const existingCodes = new Set(this.students.map(s => s.code));

        rows.forEach((row, index) => {
            const nameInput = row.querySelector('.student-name');
            const codeInput = row.querySelector('.student-code');
            const classInput = row.querySelector('.student-class');
            const groupInput = row.querySelector('.student-group');
            const guardianNameInput = row.querySelector('.student-guardian-name');
            const guardianPhoneInput = row.querySelector('.student-guardian-phone');
            const statusInput = row.querySelector('.student-status');

            const name = nameInput.value.trim();
            const code = codeInput.value.trim();
            const studentClass = classInput.value.trim();
            const group = groupInput.value.trim();
            const guardianName = guardianNameInput.value.trim();
            const guardianPhone = guardianPhoneInput.value.trim();
            const status = statusInput.value;

            if (!name && !code) return;

            if (!name) {
                errors.push(`الصف ${index + 1}: اسم الطالب مطلوب`);
                nameInput.style.borderColor = 'var(--danger-color)';
                return;
            }

            if (!code) {
                errors.push(`الصف ${index + 1}: كود الطالب مطلوب`);
                codeInput.style.borderColor = 'var(--danger-color)';
                return;
            }

            if (existingCodes.has(code)) {
                duplicateCodes++;
                errors.push(`الصف ${index + 1}: الكود "${code}" موجود مسبقاً`);
                codeInput.style.borderColor = 'var(--danger-color)';
                return;
            }

            nameInput.style.borderColor = 'var(--border-color)';
            codeInput.style.borderColor = 'var(--border-color)';

            newStudents.push({
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: name,
                code: code,
                class: studentClass,
                group: group,
                guardianName: guardianName,
                guardianPhone: guardianPhone,
                status: status,
                createdAt: new Date().toISOString()
            });
        });

        if (existingCodes.size > 0) {
            const contextKey = (s) => `${s.class}__${s.group}__${s.code}`;
            const seen = new Set(this.students.map(s => contextKey(s)));
            const filtered = [];
            for (const ns of newStudents) {
                const key = contextKey(ns);
                if (seen.has(key)) {
                    duplicateCodes++;
                } else {
                    filtered.push(ns);
                    seen.add(key);
                }
            }
            if (filtered.length === 0) {
                this.showNotification('كل الأكواد مكررة داخل نفس الصف/المجموعة. لم يتم حفظ شيء.', 'warning');
                return;
            }
            newStudents.length = 0;
            newStudents.push(...filtered);
        }

        if (errors.length > 0) {
            const errorMessage = errors.slice(0, 3).join('\n') + (errors.length > 3 ? '\n...' : '');
            this.showNotification(`تم العثور على ${errors.length} خطأ:\n${errorMessage}`, 'error');
            return;
        }

        if (newStudents.length === 0) {
            this.showNotification('لا توجد بيانات صالحة لحفظها', 'warning');
            return;
        }

        this.students.push(...newStudents);
        this.saveData();
        this.hideManualEntryModal();

        const action = clearExisting ? 'استبدال البيانات بـ' : 'إضافة';
        this.logActivity(`تم ${action} ${newStudents.length} طالب عبر الإدخال اليدوي`);

        let message = `تم حفظ ${newStudents.length} طالب`;
        if (duplicateCodes > 0) {
            message += ` (تم تجاهل ${duplicateCodes} كود مكرر)`;
        }

        this.showNotification(message, 'success');
        this.updateDisplay();
    }

    startQRScanner() {
        const { grade, group } = this.getSelectedAttendanceContext();
        if (grade === 'all' || group === 'all') {
            this.showNotification('اختر الصف والمجموعة أولاً قبل مسح QR.', 'warning');
            return;
        }

        const modal = document.getElementById('qr-scanner-modal');
        const warningDiv = document.getElementById('qr-camera-warning');
        const readerDiv = document.getElementById('qr-reader');
        modal.classList.add('show');
        warningDiv.style.display = 'none';
        readerDiv.style.display = 'block';

        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.protocol !== 'file:') {
            readerDiv.style.display = 'none';
            warningDiv.style.display = 'block';
            return;
        }

        const onScanSuccess = (decodedText, decodedResult) => {
            console.log(`Code matched = ${decodedText}`, decodedResult);
            this.hideQRScannerModal(true); 
            this.markAttendance(decodedText, 'qr');
        };

        const onScanFailure = (error) => {
            console.warn(`Code scan error = ${error}`);
        };

        try {
            if (this.html5QrcodeScanner && this.html5QrcodeScanner.getState() === 2) {
                 this.html5QrcodeScanner.clear().catch(err => console.error("Failed to clear scanner", err));
            }
    
            this.html5QrcodeScanner = new Html5QrcodeScanner(
                "qr-reader", 
                { fps: 10, qrbox: { width: 250, height: 250 } },
                /* verbose= */ false);
            this.html5QrcodeScanner.render(onScanSuccess, onScanFailure);
        } catch(e) {
            console.error("Failed to start QR scanner", e);
            this.showNotification('فشل في تشغيل ماسح QR. تأكد من منح الأذونات اللازمة.', 'error');
            this.hideQRScannerModal();
        }
    }

    hideQRScannerModal(isSuccess = false) {
        const modal = document.getElementById('qr-scanner-modal');
        if (this.html5QrcodeScanner) {
            this.html5QrcodeScanner.clear()
                .then(() => {
                    console.log("QR Code scanner stopped.");
                })
                .catch(err => {
                    console.error("Failed to clear html5QrcodeScanner.", err);
                });
        }
        modal.classList.remove('show');
        if(!isSuccess) {
            document.getElementById('student-code').focus();
        }
    }

    showStudentQR(studentId) {
        const student = this.students.find(s => s.id === studentId);
        if (!student) return;

        const modal = document.getElementById('qr-code-modal');
        const canvas = document.getElementById('qr-code-canvas');
        const title = document.getElementById('qr-modal-title');
        const studentNameEl = document.getElementById('qr-student-name');

        title.textContent = `كود QR للطالب: ${student.name}`;
        studentNameEl.textContent = student.name;

        QRCode.toCanvas(canvas, student.code, {
            width: 256,
            margin: 2,
            color: {
                dark: '#0f172a', 
                light: '#ffffff'
            }
        });
        modal.dataset.studentName = student.name; 
        modal.dataset.studentCode = student.code;
        modal.classList.add('show');
    }

    hideQrCodeModal() {
        const modal = document.getElementById('qr-code-modal');
        modal.classList.remove('show');
    }

    downloadQR() {
        const modal = document.getElementById('qr-code-modal');
        const studentName = modal.dataset.studentName || 'student';
        const studentCode = modal.dataset.studentCode || '';

        if (!studentCode) return;

        const tempCanvas = document.createElement('canvas');
        const ctx = tempCanvas.getContext('2d');
        const qrSize = 256;
        const padding = 20;
        const fontSize = 24;
        const textHeight = fontSize + padding;

        tempCanvas.width = qrSize + (padding * 2);
        tempCanvas.height = qrSize + padding + textHeight;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        const qrCanvas = document.createElement('canvas');
        
        QRCode.toCanvas(qrCanvas, studentCode, {
            width: qrSize,
            margin: 0,
            errorCorrectionLevel: 'H',
             color: {
                dark: '#0f172a', 
                light: '#ffffff'
            }
        });
        
        ctx.drawImage(qrCanvas, padding, padding);

        ctx.fillStyle = '#0f172a';
        ctx.font = `bold ${fontSize}px "NotoSansArabic"`;
        ctx.textAlign = 'center';
        ctx.fillText(studentName, tempCanvas.width / 2, qrSize + padding + fontSize);

        const dataUrl = tempCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUrl;
        const safeName = studentName.replace(/[\\/:*?"<>|]/g, '_');
        link.download = `QR_${safeName}_${studentCode}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.showNotification('تم تحميل QR Code بنجاح', 'success');
    }

    exportAllStudentQRs() {
        if (this.students.length === 0) {
            this.showNotification('لا يوجد طلاب لتصدير أكوادهم.', 'warning');
            return;
        }
        
        this.promptForPassword(async () => {
            this.showNotification('جاري تجهيز أكواد QR... قد يستغرق هذا بعض الوقت.', 'warning');
            
            try {
                const { default: JSZip } = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
                const zip = new JSZip();
                
                const tempCanvas = document.createElement('canvas');
                const ctx = tempCanvas.getContext('2d');
                const qrSize = 256;
                const padding = 20;
                const fontSize = 24;
                const textHeight = fontSize + padding;
    
                tempCanvas.width = qrSize + (padding * 2);
                tempCanvas.height = qrSize + padding + textHeight;
    
                for (const student of this.students) {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                    
                    const qrCanvas = document.createElement('canvas');
                    
                    await QRCode.toCanvas(qrCanvas, student.code, {
                        width: qrSize,
                        margin: 0,
                        errorCorrectionLevel: 'H',
                         color: {
                            dark: '#0f172a', 
                            light: '#ffffff'
                        }
                    });
                    
                    ctx.drawImage(qrCanvas, padding, padding);
    
                    ctx.fillStyle = '#0f172a';
                    ctx.font = `bold ${fontSize}px "NotoSansArabic", "Arial"`;
                    ctx.textAlign = 'center';
                    ctx.fillText(student.name, tempCanvas.width / 2, qrSize + padding + fontSize);
    
                    const dataUrl = tempCanvas.toDataURL('image/png');
                    const blob = await (await fetch(dataUrl)).blob();
                    
                    const safeName = student.name.replace(/[\\/:*?"<>|]/g, '_');
                    zip.file(`${safeName}_${student.code}.png`, blob);
                }
    
                const content = await zip.generateAsync({ type: "blob" });
                
                const link = document.createElement('a');
                link.href = URL.createObjectURL(content);
                link.download = "student_qrcodes.zip";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                this.logActivity(`تم تصدير جميع أكواد QR (${this.students.length} طالب)`);
                this.showNotification('تم تصدير جميع أكواد QR بنجاح!', 'success');
            } catch (error) {
                console.error("Failed to export all QR codes:", error);
                this.showNotification('حدث خطأ أثناء تصدير أكواد QR.', 'error');
            }
        });
    }

    displayStudents(filteredStudents = null) {
        const gradeFilter = document.getElementById('students-grade-filter').value;
        const groupFilter = document.getElementById('students-group-filter').value;

        let studentsToDisplay = filteredStudents || this.students;

        if (gradeFilter !== 'all') {
            studentsToDisplay = studentsToDisplay.filter(s => s.class === gradeFilter);
        }
        if (groupFilter !== 'all') {
            studentsToDisplay = studentsToDisplay.filter(s => s.group === groupFilter);
        }

        const container = document.getElementById('students-list');
        
        if (studentsToDisplay.length === 0) {
            container.innerHTML = `
                <div class="no-students-message">
                    <i class="fas fa-users"></i>
                    <p>لا يوجد طلاب حالياً</p>
                    <button class="btn btn-primary" onclick="app.showAddStudentModal()">
                        <i class="fas fa-plus"></i> إضافة طالب
                    </button>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();
        
        studentsToDisplay.forEach(student => {
            const presentCount = this.getAttendanceCount(student.id, 'present');
            const absentCount = this.getAttendanceCount(student.id, 'absent');
            const lateCount = this.getAttendanceCount(student.id, 'late');
            const totalClasses = presentCount + absentCount + lateCount;
            const attendanceRate = totalClasses > 0 ? Math.round(((presentCount + lateCount) / totalClasses) * 100) : 0;

            const grades = this.grades[student.id] || [];
            const avgGrade = this.calculateAverageGrade(grades);
            
            const card = document.createElement('div');
            card.className = 'student-card';
            card.innerHTML = `
                <div class="student-details">
                    <h4>${student.name}</h4>
                    <p><strong>الكود:</strong> <span>${student.code}</span></p>
                    <p><strong>الصف:</strong> <span>${student.class || 'غير محدد'}</span></p>
                    <p><strong>المجموعة:</strong> <span>${student.group || 'غير محدد'}</span></p>
                    <p><strong>ولي الأمر:</strong> <span>${student.guardianName || 'غير مسجل'}</span></p>
                    <p><strong>هاتف ولي الأمر:</strong> <span>${student.guardianPhone || 'لا يوجد'}</span></p>
                    <div class="student-stats">
                        <div class="stat">
                            <span class="stat-value">${attendanceRate}%</span>
                            <span class="stat-label">نسبة الحضور</span>
                        </div>
                        <div class="stat">
                            <span class="stat-value">${grades.length}</span>
                            <span class="stat-label">عدد الدرجات</span>
                        </div>
                    </div>
                </div>
                <div class="student-actions">
                    <button class="btn btn-primary btn-small" onclick="app.showStudentProfileModal('${student.id}')">
                        <i class="fas fa-user"></i> البروفايل
                    </button>
                    <button class="btn btn-secondary btn-small" onclick="app.showStudentQR('${student.id}')">
                        <i class="fas fa-qrcode"></i> QR
                    </button>
                    <button class="btn btn-secondary btn-small" onclick="app.showAddStudentModal('${student.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-small" onclick="app.deleteStudent('${student.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            fragment.appendChild(card);
        });

        container.innerHTML = '';
        container.appendChild(fragment);
    }

    updateReportDisplay() {
        const container = document.getElementById('report-results');
        
        if (!this.students.length) {
            container.innerHTML = `
                <div class="report-init">
                    <i class="fas fa-chart-line"></i>
                    <h3>لا يوجد طلاب لعرض تقاريرهم</h3>
                    <button class="btn btn-primary" onclick="app.showAddStudentModal()">
                        <i class="fas fa-plus"></i> إضافة طالب
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="report-init">
                <i class="fas fa-chart-line"></i>
                <h3>اختر الفلاتر ثم اضغط "إنشاء التقرير"</h3>
                <p>يمكنك تصفية البيانات حسب الصف والمجموعة والتاريخ</p>
            </div>
        `;
    }

    getAttendanceCount(studentId, status) {
        let count = 0;
        Object.keys(this.attendance).forEach(date => {
            const record = this.attendance[date][studentId];
            if (record?.status === status) {
                count++;
            }
        });
        return count;
    }

    calculateAverageGrade(grades) {
        if (!grades || grades.length === 0) return '--';
        
        const numericGrades = grades.map(g => this.extractNumericGrade(g.grade)).filter(g => g !== null);
        if (numericGrades.length === 0) return '--';
        
        const average = numericGrades.reduce((sum, grade) => sum + grade, 0) / numericGrades.length;
        
        return average.toFixed(1);
    }

    extractNumericGrade(gradeString) {
        if (!gradeString) return null;

        const matches = gradeString.match(/(\d+\.?\d*)/);
        return matches ? parseFloat(matches[1]) : null;
    }

    saveGrade(studentId, date, gradeValue, notes = '', sessionTitle = '') {
        if (!studentId || !date || !gradeValue) {
            this.showNotification('بيانات الدرجة غير مكتملة', 'warning');
            return false;
        }

        if (!this.grades[studentId]) {
            this.grades[studentId] = [];
        }

        this.grades[studentId].push({
            date,
            grade: gradeValue,
            notes,
            sessionTitle
        });

        this.saveData();
        const student = this.students.find(s => s.id === studentId);
        this.logActivity(`تم حفظ درجة للطالب: ${student ? student.name : studentId} بتاريخ ${date} (${gradeValue})`);
        this.showNotification('تم حفظ الدرجة بنجاح', 'success');
        return true;
    }

    deleteGrade(studentId, gradeDate) {
        const list = this.grades[studentId] || [];
        const idx = list.findIndex(g => g.date === gradeDate);
        if (idx === -1) {
            this.showNotification('لم يتم العثور على الدرجة المحددة', 'warning');
            return;
        }
        if (!confirm('هل أنت متأكد من حذف هذه الدرجة؟')) return;

        list.splice(idx, 1);
        if (list.length === 0) {
            delete this.grades[studentId];
        } else {
            this.grades[studentId] = list;
        }
        this.saveData();

        if (this.currentStudentProfile && this.currentStudentProfile.id === studentId) {
            this.loadGradesHistory(studentId);
        }

        const student = this.students.find(s => s.id === studentId);
        this.logActivity(`تم حذف درجة للطالب: ${student ? student.name : studentId} بتاريخ ${gradeDate}`);
        this.showNotification('تم حذف الدرجة بنجاح', 'success');
    }

    showStudentProfileModal(studentId) {
        this.currentStudentProfile = this.students.find(s => s.id === studentId);
        if (!this.currentStudentProfile) return;
    
        const modal = document.getElementById('student-profile-modal');
        document.getElementById('profile-modal-title').textContent = `بروفايل الطالب: ${this.currentStudentProfile.name}`;
    
        this.populateProfileDetails(this.currentStudentProfile);
        this.populateMonthSelector();
        
        this.loadAttendanceHistory(this.currentStudentProfile.id);
        this.updateProfileStatusActions(this.currentStudentProfile.id);
        this.loadGradesHistory(this.currentStudentProfile.id);
        this.loadBehavioralNotes(this.currentStudentProfile.id);
        this.populatePalmPrintStatus(this.currentStudentProfile);
    
        document.getElementById('monthly-report-content').innerHTML = '';
        document.getElementById('export-monthly-report').style.display = 'none';
    
        modal.classList.add('show');
    }

    populateProfileDetails(student) {
        const container = document.getElementById('profile-details-content');
        container.innerHTML = `
            <div class="profile-detail-item"><strong>الكود:</strong> <span>${student.code}</span></div>
            <div class="profile-detail-item"><strong>الصف:</strong> <span>${student.class || 'غير محدد'}</span></div>
            <div class="profile-detail-item"><strong>المجموعة:</strong> <span>${student.group || 'غير محدد'}</span></div>
            <div class="profile-detail-item"><strong>الحالة:</strong> <span>${student.status || 'عام'}</span></div>
            <div class="profile-detail-item"><strong>ولي الأمر:</strong> <span>${student.guardianName || 'غير مسجل'}</span></div>
            <div class="profile-detail-item"><strong>هاتف ولي الأمر:</strong> <span>${student.guardianPhone || 'لا يوجد'}</span></div>
            <div class="profile-detail-item"><strong>تاريخ التسجيل:</strong> <span>${new Date(student.createdAt).toLocaleDateString('ar-SA')}</span></div>
            <div id="profile-status-actions" class="profile-detail-item" style="grid-column: 1 / -1; background-color: transparent; border: none; padding: 0;"></div>
        `;
    }

    populateMonthSelector() {
        const selector = document.getElementById('report-month-selector');
        selector.innerHTML = '';
    
        const dates = new Set();
        Object.keys(this.attendance).forEach(date => dates.add(date.substring(0, 7)));
        Object.values(this.grades).flat().forEach(grade => dates.add(grade.date.substring(0, 7)));
    
        const today = new Date();
        const currentMonth = today.toISOString().substring(0, 7);
        dates.add(currentMonth);
    
        const sortedMonths = [...dates].sort().reverse();
    
        sortedMonths.forEach(month => {
            const [year, monthNum] = month.split('-');
            const monthDate = new Date(year, monthNum - 1);
            const option = document.createElement('option');
            option.value = month;
            option.textContent = monthDate.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long' });
            selector.appendChild(option);
        });
    }

    loadAttendanceHistory(studentId) {
        const attendanceDays = Object.keys(this.attendance).sort((a, b) => new Date(b) - new Date(a));
        let presentCount = 0;
        let lateCount = 0;
        let absentCount = 0;

        const tbody = document.getElementById('attendance-history-body');
        tbody.innerHTML = '';

        attendanceDays.forEach(date => {
            const record = this.attendance[date][studentId];
            if (record) {
                const status = record.status;
                if (status === 'present') {
                    presentCount++;
                } else if (status === 'late') {
                    lateCount++;
                } else if (status === 'absent') {
                    absentCount++;
                } else if (status === 'makeup') {
                    presentCount++; 
                }
            }
        });
        
        const total = presentCount + lateCount + absentCount;
        const attendanceRate = total > 0 ? Math.round(((presentCount + lateCount) / total) * 100) : 0;

        document.getElementById('total-attendance').textContent = presentCount + lateCount;
        document.getElementById('total-absence').textContent = absentCount;
        document.getElementById('attendance-percentage').textContent = `${attendanceRate}%`;

        attendanceDays.forEach(date => {
            const record = this.attendance[date][studentId];
            if (record) {
                const status = record.status;
                let statusText = 'لم يسجل';
                let statusClass = 'status-pending';

                if (status === 'present') {
                    statusText = 'حاضر';
                    statusClass = 'status-present';
                } else if (status === 'late') {
                    statusText = 'متأخر';
                    statusClass = 'status-late';
                } else if (status === 'absent') {
                    statusText = 'غائب';
                    statusClass = 'status-absent';
                } else if (status === 'makeup') {
                    statusText = `تعويض (مجموعة ${record.attendedGroup})`;
                    statusClass = 'status-makeup';
                }

                const row = document.createElement('tr');
                const dateObj = new Date(date);
                const dayName = dateObj.toLocaleDateString('ar-SA', { weekday: 'long' });
                const formattedDate = dateObj.toLocaleDateString('ar-SA');

                row.innerHTML = `
                    <td>${formattedDate}</td>
                    <td>${dayName}</td>
                    <td><span class="attendance-status-badge ${statusClass}">${statusText}</span></td>
                    <td>${record.time || '--'}</td>
                    <td><button class="btn btn-warning btn-small" onclick="app.toggleAbsenceMakeup('${studentId}', '${date}', '${status}')"><i class="fas fa-exchange-alt"></i> ${status === 'absent' ? 'تحويل غياب إلى تعويض' : 'إرجاع غياب'}</button></td>
                `;
                tbody.appendChild(row);
            }
        });
    }

    loadGradesHistory(studentId) {
        const grades = (this.grades[studentId] || []).sort((a, b) => new Date(b.date) - new Date(a.date));
        const tbody = document.getElementById('grades-table-body');

        if (grades.length > 0) {
            tbody.innerHTML = grades.map(grade => `
                <tr>
                    <td>${new Date(grade.date).toLocaleDateString('ar-SA')}</td>
                    <td>${grade.sessionTitle || 'حصة عامة'}</td>
                    <td>${grade.grade || '---'}</td>
                    <td>${grade.notes || '---'}</td>
                    <td>
                        <button class="btn btn-danger btn-small" onclick="app.deleteGrade('${studentId}', '${grade.date}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('');

            this.calculateGradeStatistics(grades);
        } else {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem;">لا توجد درجات مسجلة لهذا الطالب.</td></tr>`;
            this.resetGradeStatistics();
        }
    }

    calculateGradeStatistics(grades) {
        const numericGrades = grades
            .map(g => this.extractNumericGrade(g.grade))
            .filter(g => g !== null);

        if (numericGrades.length > 0) {
            const average = numericGrades.reduce((sum, grade) => sum + grade, 0) / numericGrades.length;
            const highest = Math.max(...numericGrades);
            const lowest = Math.min(...numericGrades);

            document.getElementById('average-grade').textContent = average.toFixed(1);
            document.getElementById('highest-grade').textContent = highest.toString();
            document.getElementById('lowest-grade').textContent = lowest.toString();
        } else {
            this.resetGradeStatistics();
        }
    }

    resetGradeStatistics() {
        document.getElementById('average-grade').textContent = '--';
        document.getElementById('highest-grade').textContent = '--';
        document.getElementById('lowest-grade').textContent = '--';
    }

    loadBehavioralNotes(studentId) {
        const notes = (this.behavioralNotes[studentId] || []).sort((a, b) => new Date(b.date) - new Date(a.date));
        const container = document.getElementById('behavioral-notes-list');

        if (notes.length > 0) {
            container.innerHTML = notes.map((note, index) => `
                <div class="behavioral-note-item">
                    <div class="note-header">
                        <span class="note-date">${new Date(note.date).toLocaleString('ar-SA')}</span>
                        <button class="btn-delete-note" onclick="app.deleteBehavioralNote('${studentId}', ${index})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <div class="note-content">${note.content}</div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<div class="no-notes">لا توجد ملاحظات</div>';
        }
    }

    showAddGradeModal() {
        if (!this.currentStudentProfile) return;

        const modal = document.getElementById('add-grade-modal');

        document.getElementById('grade-date').value = this.currentDate;
        document.getElementById('session-title').value = '';
        document.getElementById('grade-value').value = '';
        document.getElementById('grade-notes').value = '';

        modal.classList.add('show');
    }

    hideAddGradeModal() {
        const modal = document.getElementById('add-grade-modal');
        modal.classList.remove('show');
    }

    saveNewGrade() {
        if (!this.currentStudentProfile) return;

        const date = document.getElementById('grade-date').value;
        const sessionTitle = document.getElementById('session-title').value.trim();
        const gradeValue = document.getElementById('grade-value').value.trim();
        const notes = document.getElementById('grade-notes').value.trim();

        if (!date || !gradeValue) {
            this.showNotification('يرجى إدخال التاريخ والدرجة على الأقل', 'warning');
            return;
        }

        if (this.isDayLocked(date)) {
            this.showNotification('هذا اليوم مغلق ولا يمكن إضافة درجات.', 'error');
            return;
        }

        this.saveGrade(this.currentStudentProfile.id, date, gradeValue, notes, sessionTitle);
        this.hideAddGradeModal();

        this.loadGradesHistory(this.currentStudentProfile.id);
    }

    addBehavioralNote() {
        if (!this.currentStudentProfile) return;

        const noteContent = document.getElementById('new-behavioral-note').value.trim();
        if (!noteContent) {
            this.showNotification('يرجى إدخال محتوى الملاحظة', 'warning');
            return;
        }

        const studentId = this.currentStudentProfile.id;
        if (!this.behavioralNotes[studentId]) {
            this.behavioralNotes[studentId] = [];
        }

        this.behavioralNotes[studentId].push({
            date: this.currentDate,
            content: noteContent,
            timestamp: new Date().toISOString()
        });

        this.saveData();
        document.getElementById('new-behavioral-note').value = '';
        this.loadBehavioralNotes(studentId);
        this.logActivity(`تم إضافة ملاحظة سلوكية للطالب: ${this.currentStudentProfile.name}`);
        this.showNotification('تم إضافة الملاحظة بنجاح', 'success');
    }

    deleteBehavioralNote(studentId, index) {
        if (confirm('هل أنت متأكد من حذف هذه الملاحظة؟')) {
            this.behavioralNotes[studentId].splice(index, 1);
            if (this.behavioralNotes[studentId].length === 0) {
                delete this.behavioralNotes[studentId];
            }
            this.saveData();
            this.loadBehavioralNotes(studentId);
            this.logActivity(`تم حذف ملاحظة سلوكية للطالب ID: ${studentId}`);
            this.showNotification('تم حذف الملاحظة بنجاح', 'success');
        }
    }

    generateMonthlyReport() {
        if (!this.currentStudentProfile) return;

        const selectedMonth = document.getElementById('report-month-selector').value;
        const reportData = this.generateStudentMonthlyData(this.currentStudentProfile.id, selectedMonth);

        this.displayMonthlyReport(reportData, selectedMonth);
        document.getElementById('export-monthly-report').style.display = 'inline-flex';
    }

    generateStudentMonthlyData(studentId, month) {
        const student = this.students.find(s => s.id === studentId);
        if (!student) return null;

        const [year, monthNum] = month.split('-').map(Number);
        const startDate = new Date(year, monthNum - 1, 1);
        const endDate = new Date(year, monthNum, 0);

        const reportData = {
            student: student,
            month: month,
            monthName: startDate.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long' }),
            attendance: this.getMonthlyAttendance(studentId, startDate, endDate),
            grades: this.getMonthlyGrades(studentId, startDate, endDate),
            behavioralNotes: this.getMonthlyBehavioralNotes(studentId, startDate, endDate)
        };

        return reportData;
    }

    getMonthlyAttendance(studentId, startDate, endDate) {
        const attendance = { present: 0, late: 0, absent: 0, total: 0, details: [] };

        Object.keys(this.attendance).forEach(date => {
            const dateObj = new Date(date);
            if (dateObj >= startDate && dateObj <= endDate) {
                const record = this.attendance[date][studentId];
                if (record) {
                    const status = record.status;
                    if (status === 'present') {
                        attendance.present++;
                        attendance.total++;
                    } else if (status === 'late') {
                        attendance.late++;
                        attendance.total++;
                    } else if (status === 'absent') {
                        attendance.absent++;
                    } else if (status === 'makeup') {
                        attendance.present++; 
                    }
                }
            }
        });
        
        attendance.percentage = attendance.total > 0 ? Math.round(((attendance.present + attendance.late) / attendance.total) * 100) : 0;
        return attendance;
    }

    getMonthlyGrades(studentId, startDate, endDate) {
        const studentGrades = this.grades[studentId] || [];
        return studentGrades.filter(grade => {
            const gradeDate = new Date(grade.date);
            return gradeDate >= startDate && gradeDate <= endDate;
        }).sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    getMonthlyBehavioralNotes(studentId, startDate, endDate) {
        const notes = this.behavioralNotes[studentId] || [];
        return notes.filter(note => {
            const noteDate = new Date(note.date);
            return noteDate >= startDate && noteDate <= endDate;
        }).sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    displayMonthlyReport(reportData, month) {
        if (!reportData) return;

        const container = document.getElementById('monthly-report-content');
        const grades = reportData.grades;
        const numericGrades = grades.map(g => this.extractNumericGrade(g.grade)).filter(g => g !== null);
        const avgGrade = numericGrades.length > 0 ? (numericGrades.reduce((sum, grade) => sum + grade, 0) / numericGrades.length).toFixed(1) : '--';
        const highestGrade = numericGrades.length > 0 ? Math.max(...numericGrades) : '--';
        const lowestGrade = numericGrades.length > 0 ? Math.min(...numericGrades) : '--';

        container.innerHTML = `
            <div class="monthly-report">
                <div class="report-header">
                    <h3>التقرير الشهري - ${reportData.monthName}</h3>
                    <div class="report-student-info">
                        <p><strong>الطالب:</strong> ${reportData.student.name}</p>
                        <p><strong>الكود:</strong> ${reportData.student.code}</p>
                        <p><strong>الصف:</strong> ${reportData.student.class || 'غير محدد'} - ${reportData.student.group || 'غير محدد'}</p>
                    </div>
                </div>

                <div class="report-sections">
                    <div class="report-section">
                        <h4>ملخص الحضور والغياب</h4>
                        <div class="attendance-summary-report">
                            <div class="summary-item">
                                <span class="label">إجمالي الحصص:</span>
                                <span class="value">${reportData.attendance.total}</span>
                            </div>
                            <div class="summary-item">
                                <span class="label">الحضور:</span>
                                <span class="value present-color">${reportData.attendance.present}</span>
                            </div>
                            <div class="summary-item">
                                <span class="label">التأخر:</span>
                                <span class="value late-color">${reportData.attendance.late}</span>
                            </div>
                            <div class="summary-item">
                                <span class="label">الغياب:</span>
                                <span class="value absent-color">${reportData.attendance.absent}</span>
                            </div>
                            <div class="summary-item">
                                <span class="label">نسبة الحضور:</span>
                                <span class="value">${reportData.attendance.percentage}%</span>
                            </div>
                        </div>
                    </div>

                    <div class="report-section">
                        <h4>سجل الدرجات</h4>
                        <div class="grades-summary-report">
                            <div class="summary-item">
                                <span class="label">المتوسط العام:</span>
                                <span class="value">${avgGrade}</span>
                            </div>
                            <div class="summary-item">
                                <span class="label">أعلى درجة:</span>
                                <span class="value">${highestGrade}</span>
                            </div>
                            <div class="summary-item">
                                <span class="label">أقل درجة:</span>
                                <span class="value">${lowestGrade}</span>
                            </div>
                        </div>
                        ${grades.length > 0 ? `
                            <div class="grades-table-report">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>التاريخ</th>
                                            <th>الحصة</th>
                                            <th>الدرجة</th>
                                            <th>الملاحظات</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${grades.map(grade => `
                                            <tr>
                                                <td>${new Date(grade.date).toLocaleDateString('ar-SA')}</td>
                                                <td>${grade.sessionTitle || 'حصة عامة'}</td>
                                                <td>${grade.grade || '---'}</td>
                                                <td>${grade.notes || '---'}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : '<p>لا توجد درجات في هذا الشهر</p>'}
                    </div>

                    <div class="report-section">
                        <h4>الملاحظات السلوكية والأكاديمية</h4>
                        ${reportData.behavioralNotes.length > 0 ? `
                            <div class="behavioral-notes-report">
                                ${reportData.behavioralNotes.map(note => `
                                    <div class="note-item-report">
                                        <div class="note-date-report">${new Date(note.date).toLocaleDateString('ar-SA')}</div>
                                        <div class="note-content-report">${note.content}</div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : '<p>لا توجد ملاحظات في هذا الشهر</p>'}
                    </div>
                </div>
            </div>
        `;
    }

    loadMonthlyReport(month) {
        if (!this.currentStudentProfile) return;

        if (this.monthlyReports[month] && this.monthlyReports[month][this.currentStudentProfile.id]) {
            this.displayMonthlyReport(this.monthlyReports[month][this.currentStudentProfile.id], month);
        } else {
            const reportData = this.generateStudentMonthlyData(this.currentStudentProfile.id, month);
            this.displayMonthlyReport(reportData, month);
        }

        document.getElementById('export-monthly-report').style.display = 'inline-flex';
    }

    exportMonthlyReportPDF() {
        if (!this.currentStudentProfile) return;

        const reportContent = document.getElementById('monthly-report-content').innerHTML;
        const selectedMonth = document.getElementById('report-month-selector').value;
        const monthName = document.getElementById('report-month-selector').selectedOptions[0].text;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <title>التقرير الشهري - ${this.currentStudentProfile.name}</title>
                <style>
                    body { font-family: 'NotoSansArabic', Arial, sans-serif; margin: 20px; }
                    .monthly-report { max-width: 800px; margin: 0 auto; }
                    .report-header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
                    .report-section { margin: 20px 0; page-break-inside: avoid; }
                    .report-section h4 { background: #f0f0f0; padding: 10px; margin-bottom: 15px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
                    th { background-color: #f9f9f9; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                ${reportContent}
            </body>
            </html>
        `);

        printWindow.document.close();
        setTimeout(() => {
            printWindow.print();
        }, 500);

        this.showNotification('تم فتح التقرير للطباعة أو التصدير كـ PDF', 'success');
    }

    hideStudentProfileModal() {
        const modal = document.getElementById('student-profile-modal');
        modal.classList.remove('show');
        this.currentStudentProfile = null;
    }

    populatePalmPrintStatus(student) {
        const container = document.getElementById('palm-print-status');
        const palmData = this.palmTemplates[student.id];
    
        if (palmData) {
            container.innerHTML = `
                <div class="status-indicator enrolled">
                    <i class="fas fa-check-circle"></i>
                    <span>بصمة الكف مسجلة</span>
                </div>
                <div class="status-details">
                    تاريخ التسجيل: ${new Date(palmData.enrolledAt).toLocaleDateString('ar-SA')}
                </div>
                <div class="palm-print-actions">
                    <button class="btn btn-secondary" onclick="app.showPalmEnrollModal('${student.id}')">
                        <i class="fas fa-redo"></i> تحديث البصمة
                    </button>
                    <button class="btn btn-danger" onclick="app.deletePalmTemplate('${student.id}')">
                        <i class="fas fa-trash"></i> حذف البصمة
                    </button>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="status-indicator not-enrolled">
                    <i class="fas fa-times-circle"></i>
                    <span>بصمة الكف غير مسجلة</span>
                </div>
                <div class="palm-print-actions">
                    <button class="btn btn-primary" onclick="app.showPalmEnrollModal('${student.id}')">
                        <i class="fas fa-hand-paper"></i> تسجيل بصمة الكف
                    </button>
                </div>
            `;
        }
    }

    updateProfileStatusActions(studentId) {
        // الحاوية أعلى قسم ملخص الحضور
        const summaryContainer = document.querySelector('.attendance-history-section .attendance-summary');
        if (!summaryContainer) return;

        // أضف الزر مرة واحدة
        let existingBar = document.getElementById('profile-status-actions');
        if (existingBar) existingBar.remove();

        const actionsBar = document.createElement('div');
        actionsBar.id = 'profile-status-actions';
        actionsBar.style.display = 'flex';
        actionsBar.style.justifyContent = 'flex-end';
        actionsBar.style.gap = '.5rem';
        actionsBar.style.marginTop = '-.75rem';

        // حالة اليوم
        const todayRecord = (this.attendance[this.currentDate] || {})[studentId];

        // اليوم مغلق؟
        const locked = this.isDayLocked(this.currentDate);

        if (todayRecord?.status === 'absent' && !locked) {
            const btnMakeup = document.createElement('button');
            btnMakeup.className = 'btn btn-warning btn-small';
            btnMakeup.innerHTML = '<i class="fas fa-exchange-alt"></i> تحويل غياب اليوم إلى تعويض';
            btnMakeup.id = 'convert-absent-btn';
            btnMakeup.onclick = () => {
                this.convertAbsentToMakeup(studentId);
            };
            actionsBar.appendChild(btnMakeup);
        } else if (todayRecord?.status === 'makeup' && !locked) {
            const btnAbsent = document.createElement('button');
            btnAbsent.className = 'btn btn-danger btn-small';
            btnAbsent.innerHTML = '<i class="fas fa-undo"></i> إرجاع حالة اليوم إلى غياب';
            btnAbsent.id = 'convert-makeup-to-absent-btn';
            btnAbsent.onclick = () => {
                this.promptForPassword(() => this.convertMakeupToAbsent(studentId));
            };
            actionsBar.appendChild(btnAbsent);
        }

        if (actionsBar.children.length > 0) {
            summaryContainer.parentElement.insertBefore(actionsBar, summaryContainer.nextSibling);
        }
    }

    convertAbsentToMakeup(studentId) {
        if (!this.attendance[this.currentDate]) this.attendance[this.currentDate] = {};
        const record = this.attendance[this.currentDate][studentId];

        if (!record || record.status !== 'absent') {
            this.showNotification('لا توجد حالة غياب اليوم لتحويلها.', 'warning');
            return;
        }
        if (this.isDayLocked(this.currentDate)) {
            this.showNotification('اليوم مغلق ولا يمكن التعديل.', 'error');
            return;
        }

        const student = this.students.find(s => s.id === studentId);
        const now = new Date();

        this.attendance[this.currentDate][studentId] = {
            status: 'makeup',
            method: 'manual',
            time: now.toTimeString().slice(0, 5),
            originalGroup: student ? student.group : null,
            attendedGroup: student ? student.group : null
        };

        this.saveData();
        this.logActivity(`تم تحويل حالة اليوم للطالب ${student ? student.name : studentId} من غياب إلى تعويض`, 'alert');
        this.showNotification('تم تحويل حالة اليوم إلى تعويض.', 'success');

        if (this.currentStudentProfile && this.currentStudentProfile.id === studentId) {
            this.loadAttendanceHistory(studentId);
            this.updateProfileStatusActions(studentId);
        }
        this.updateDisplay();
    }

    convertMakeupToAbsent(studentId) {
        if (!this.attendance[this.currentDate]) this.attendance[this.currentDate] = {};
        const record = this.attendance[this.currentDate][studentId];

        if (!record || record.status !== 'makeup') {
            this.showNotification('لا توجد حالة تعويض اليوم لإرجاعها.', 'warning');
            return;
        }
        if (this.isDayLocked(this.currentDate)) {
            this.showNotification('اليوم مغلق ولا يمكن التعديل.', 'error');
            return;
        }

        this.attendance[this.currentDate][studentId] = {
            status: 'absent',
            method: 'manual'
        };

        this.saveData();
        const student = this.students.find(s => s.id === studentId);
        this.logActivity(`تم إرجاع حالة اليوم للطالب ${student ? student.name : studentId} من تعويض إلى غياب`);
        this.showNotification('تم إرجاع الحالة إلى غياب.', 'success');

        if (this.currentStudentProfile && this.currentStudentProfile.id === studentId) {
            this.loadAttendanceHistory(studentId);
            this.updateProfileStatusActions(studentId);
        }
        this.updateDisplay();
    }

    promptForPassword(actionCallback, title = 'مطلوب كلمة المرور') {
        const modal = document.getElementById('password-modal');
        const modalTitle = document.getElementById('password-modal-title');
        const promptMessage = document.getElementById('password-prompt-message');
        const newPasswordGroup = document.getElementById('new-password-group');
        const confirmBtn = document.getElementById('confirm-password-btn');

        document.getElementById('admin-password-input').value = '';
        document.getElementById('admin-new-password-input').value = '';
        newPasswordGroup.style.display = 'none';

        if (actionCallback === 'changePassword') {
            modalTitle.textContent = 'تغيير كلمة المرور';
            promptMessage.textContent = 'أدخل كلمة المرور الحالية والجديدة.';
            newPasswordGroup.style.display = 'block';
        } else if (typeof actionCallback === 'string') {
            // Handle legacy calls with string actions
            if (actionCallback === 'endDay') {
                 modalTitle.textContent = 'تأكيد إنهاء اليوم';
                 promptMessage.textContent = 'لإنهاء اليوم، يرجى إدخال كلمة المرور.';
             } else if (actionCallback === 'startNewDay') {
                 modalTitle.textContent = 'تأكيد بدء يوم جديد';
                 promptMessage.textContent = 'لبداء يوم جديد، يرجى إدخال كلمة المرور.';
             } else if (actionCallback === 'clearLog') {
                 modalTitle.textContent = 'تأكيد مسح السجل';
                 promptMessage.textContent = 'لمسح سجل النشاطات، يرجى إدخال كلمة المرور.';
            }
        } else {
             modalTitle.textContent = title;
             promptMessage.textContent = 'هذا الإجراء يتطلب صلاحيات المدير.';
        }

        modal.classList.add('show');
        document.getElementById('admin-password-input').focus();

        confirmBtn.onclick = () => {
            const password = document.getElementById('admin-password-input').value;
            if (password !== this.adminPassword) {
                this.showNotification('كلمة المرور غير صحيحة!', 'error');
                return;
            }

            this.hidePasswordModal();
            if (typeof actionCallback === 'function') {
                actionCallback();
            } else if (typeof this[actionCallback] === 'function') {
                this[actionCallback]();
            }
        };
    }

    hidePasswordModal() {
        document.getElementById('password-modal').classList.remove('show');
    }

    changePassword() {
        const newPassword = document.getElementById('admin-new-password-input').value;
        if (newPassword.length < 4) {
            this.showNotification('كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل', 'warning');
            return;
        }
        this.adminPassword = newPassword;
        this.saveData();
        this.logActivity(`تم تحديث الإعدادات العامة. وقت التأخير: ${this.lateTime}, اسم المؤسسة: ${this.institutionName}`);
        this.showNotification('تم حفظ الإعدادات بنجاح', 'success');
    }

    isDayLocked(date) {
        return this.lockedDays.includes(date);
    }

    endDay() {
        const today = this.currentDate;
        if (this.isDayLocked(today)) {
            this.showNotification('هذا اليوم مغلق بالفعل.', 'warning');
            return;
        }
        if (confirm(`هل أنت متأكد من إنهاء يوم ${today}؟ لن تتمكن من تعديل أي بيانات لهذا اليوم بعد ذلك.`)) {
            this.lockedDays.push(today);
            this.saveData();
            this.logActivity(`تم إنهاء وإغلاق اليوم: ${today}`);
            this.showNotification(`تم إنهاء اليوم ${today} بنجاح.`, 'success');
            this.exportDailyReport();
            this.updateDisplay(); 
        }
    }

    startNewDay() {
        const today = this.currentDate;
        if (this.isDayLocked(today)) {
            this.showNotification('هذا اليوم مغلق بالفعل. لا يمكن بدء يوم جديد منه.', 'error');
            return;
        }

        if (confirm(`هل أنت متأكد من إنهاء يوم ${today} وبدء يوم جديد؟ سيتم تسجيل الغياب تلقائياً للطلاب الذين لم يحضروا.`)) {
            // Mark remaining students as absent for all groups
            this.students.forEach(student => {
                 if (!this.attendance[this.currentDate]) {
                    this.attendance[this.currentDate] = {};
                }
                if (!this.attendance[this.currentDate][student.id]) {
                    this.attendance[this.currentDate][student.id] = { status: 'absent', method: 'auto' };
                }
            });

            // Lock the day
            this.lockedDays.push(today);
            this.logActivity(`تم إنهاء وإغلاق اليوم تلقائياً: ${today}`);

            // Set the new day
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            this.currentDate = tomorrow.toISOString().split('T')[0];
            localStorage.setItem('appCurrentDate', this.currentDate);
            
            this.saveData();

            this.logActivity(`تم بدء يوم دراسي جديد: ${this.currentDate}`);
            this.showNotification(`تم بدء يوم جديد بنجاح: ${this.currentDate}`, 'success');

            // Refresh the entire UI
            location.reload();
        }
    }

    logActivity(description, type = 'info') {
        this.activityLog.unshift({
            date: new Date().toISOString(),
            description: description,
            type: type
        });
        if (this.activityLog.length > 200) {
            this.activityLog.pop();
        }
        this.saveData();
    }

    toggleActivityLog() {
        const container = document.getElementById('activity-log-container');
        if (container.style.display === 'none') {
            this.displayActivityLog();
            container.style.display = 'block';
            document.getElementById('view-log-btn').textContent = 'إخفاء السجل';
        } else {
            container.style.display = 'none';
            document.getElementById('view-log-btn').textContent = 'عرض السجل';
        }
    }

    displayActivityLog() {
        const list = document.getElementById('activity-log-list');
        if (this.activityLog.length === 0) {
            list.innerHTML = '<p>لا توجد نشاطات مسجلة.</p>';
            return;
        }

        list.innerHTML = this.activityLog.map(log => {
            const typeClass = log.type ? log.type : '';
            return `
            <div class="log-item ${typeClass}">
                <span class="log-date">${new Date(log.date).toLocaleString('ar-EG')}</span>
                <p class="log-description">${log.description}</p>
            </div>
            `;
        }).join('');
    }

    clearLog() {
        if (confirm('هل أنت متأكد من مسح سجل النشاطات بالكامل؟ لا يمكن التراجع عن هذا الإجراء.')) {
            this.activityLog = [];
            this.saveData();
            this.displayActivityLog();
            this.showNotification('تم مسح سجل النشاطات بنجاح.', 'success');
        }
    }

    showAdminModal() {
        document.getElementById('admin-modal').classList.add('show');
    }

    hideAdminModal() {
        document.getElementById('admin-modal').classList.remove('show');
    }

    saveAdminSettings() {
        this.lateTime = document.getElementById('late-time').value;
        this.institutionName = document.getElementById('institution-name').value;
        this.saveData();
        this.hideAdminModal();
        this.logActivity(`تم تحديث الإعدادات العامة. وقت التأخير: ${this.lateTime}, اسم المؤسسة: ${this.institutionName}`);
        this.showNotification('تم حفظ الإعدادات بنجاح', 'success');
    }

    refreshDatalists() {
        const classDL = document.getElementById('class-options');
        const groupDL = document.getElementById('group-options');
        if (!classDL || !groupDL) return;

        const classes = [...new Set(this.students.map(s => s.class).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'));
        const groups = [...new Set(this.students.map(s => s.group).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'));

        classDL.innerHTML = classes.map(c => `<option value="${c}"></option>`).join('');
        groupDL.innerHTML = groups.map(g => `<option value="${g}"></option>`).join('');
    }

    getSelectedAttendanceContext() {
        const gradeSel = document.getElementById('attendance-grade-filter');
        const groupSel = document.getElementById('attendance-group-filter');
        const grade = gradeSel ? gradeSel.value : 'all';
        const group = groupSel ? groupSel.value : 'all';
        return { grade, group };
    }

    resetPalmModal() {
        const modal = document.getElementById('palm-enroll-modal');
        this.resetPalmModalUI();
        document.getElementById('palm-enroll-instructions').textContent = 'يرجى وضع كف الطالب أمام الكاميرا لبدء المسح.';
    }

    resetPalmModalUI() {
        const progressBar = document.getElementById('enroll-progress-bar');
        const progressText = document.getElementById('enroll-progress-text');
        const progressContainer = document.getElementById('palm-enroll-progress-container');
        const retryBtn = document.getElementById('palm-retry-btn');

        if(progressContainer) progressContainer.style.display = 'block';
        if(progressBar) progressBar.style.width = '0%';
        if(progressText) progressText.textContent = '';
        if(retryBtn) retryBtn.style.display = 'none';
    }

    stopVideoStream() {
        if (window.palmVideoStream) {
            window.palmVideoStream.getTracks().forEach(track => track.stop());
            window.palmVideoStream = null;
        }
        const videoElement = document.getElementById('palm-video-feed');
        if (videoElement) {
            videoElement.srcObject = null;
        }
    }

    async showPalmEnrollModal(studentId) {
        // Ensure profile context if called from outside the profile
        if (!this.currentStudentProfile || (studentId && this.currentStudentProfile.id !== studentId)) {
            const student = this.students.find(s => s.id === studentId);
            if (student) this.currentStudentProfile = student;
        }

        this.currentPalmAction = 'enroll';
        this.resetPalmModal();
        const modal = document.getElementById('palm-enroll-modal');

        // Inject controls (camera switch + torch) once
        const body = modal.querySelector('.palm-enroll-body');
        if (!document.getElementById('palm-controls')) {
            const controls = document.createElement('div');
            controls.id = 'palm-controls';
            controls.style.display = 'flex';
            controls.style.gap = '.5rem';
            controls.style.flexWrap = 'wrap';
            controls.style.justifyContent = 'center';
            controls.style.marginTop = '-.75rem';

            controls.innerHTML = `
                <button class="btn btn-secondary" id="toggle-camera-btn">
                    <i class="fas fa-sync-alt"></i> تبديل الكاميرا
                </button>
                <button class="btn btn-secondary" id="toggle-torch-btn" disabled>
                    <i class="fas fa-bolt"></i> تشغيل/إيقاف الفلاش
                </button>
            `;
            body.insertBefore(controls, body.querySelector('.scanner-container'));
        }

        modal.classList.add('show');

        // Try back camera first, then fallback to front
        this.preferredFacingMode = 'environment';
        await this.startPalmVideoStream();
        // Auto-start simulated enrollment after short warm-up
        setTimeout(() => {
            if (this.currentPalmAction === 'enroll' && this.currentStudentProfile) {
                this.simulateEnrollmentProcess(this.currentStudentProfile.id);
            }
        }, 1200);
    }

    hidePalmEnrollModal() {
        const modal = document.getElementById('palm-enroll-modal');
        modal.classList.remove('show');
        this.stopVideoStream();
        this.currentPalmAction = null;
    }

    async startPalmVerification() {
        const { grade, group } = this.getSelectedAttendanceContext();
        if (grade === 'all' || group === 'all') {
            this.showNotification('اختر الصف والمجموعة أولاً قبل بصمة الكف.', 'warning');
            return;
        }
        this.currentPalmAction = 'verify';
        this.resetPalmModal();
        const modal = document.getElementById('palm-enroll-modal');
        const text = document.getElementById('palm-enroll-instructions');
        text.textContent = 'ضع كف الطالب أمام الكاميرا للتحقق.';
        modal.classList.add('show');
        this.preferredFacingMode = 'environment';
        await this.startPalmVideoStream();
        // Simulate verification flow
        setTimeout(() => this.simulateVerificationProcess(), 1500);
    }

    async startPalmVideoStream() {
        try {
            this.stopVideoStream();

            const video = document.getElementById('palm-video-feed');
            const warningDiv = document.getElementById('palm-camera-warning');

            const constraints = {
                audio: false,
                video: {
                    facingMode: { ideal: this.preferredFacingMode || 'environment' },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };

            // On some devices explicit deviceId works better after enumerate
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter(d => d.kind === 'videoinput');
            this.videoInputs = videoInputs;

            // Try to pick back camera device
            if (videoInputs.length) {
                const back = videoInputs.find(d => /back|rear|environment/i.test(d.label));
                const front = videoInputs.find(d => /front|user/i.test(d.label));
                const chosen = this.preferredFacingMode === 'environment' ? (back || front || videoInputs[0]) : (front || back || videoInputs[0]);
                if (chosen && chosen.deviceId) {
                    constraints.video = {
                        deviceId: { exact: chosen.deviceId },
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    };
                    this.currentVideoDeviceId = chosen.deviceId;
                }
            }

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            window.palmVideoStream = stream;
            video.srcObject = stream;
            await video.play();

            warningDiv.style.display = 'none';

            // Torch capability check
            this.torchEnabled = false;
            this.updateTorchAvailability();

        } catch (err) {
            console.error('Failed to start palm video stream:', err);
            const warningDiv = document.getElementById('palm-camera-warning');
            if (warningDiv) warningDiv.style.display = 'block';
            this.showNotification('تعذر تشغيل الكاميرا. تأكد من الأذونات واستخدم https.', 'error');
        }
    }

    async togglePalmCamera() {
        if (!this.videoInputs || this.videoInputs.length < 2) {
            // Toggle facingMode preference and retry
            this.preferredFacingMode = this.preferredFacingMode === 'environment' ? 'user' : 'environment';
        } else {
            // Switch between available deviceIds
            const idx = this.videoInputs.findIndex(d => d.deviceId === this.currentVideoDeviceId);
            const next = this.videoInputs[(idx + 1) % this.videoInputs.length];
            this.currentVideoDeviceId = next.deviceId;
        }
        await this.startPalmVideoStream();
    }

    updateTorchAvailability() {
        const video = document.getElementById('palm-video-feed');
        const btn = document.getElementById('toggle-torch-btn');
        try {
            const track = video?.srcObject?.getVideoTracks?.()[0];
            const caps = track?.getCapabilities?.();
            if (caps && 'torch' in caps) {
                btn.removeAttribute('disabled');
                this.torchCapable = true;
            } else {
                btn.setAttribute('disabled', 'true');
                this.torchCapable = false;
            }
        } catch {
            if (btn) btn.setAttribute('disabled', 'true');
            this.torchCapable = false;
        }
    }

    async toggleTorch() {
        const video = document.getElementById('palm-video-feed');
        const track = video?.srcObject?.getVideoTracks?.()[0];
        if (!track || !this.torchCapable) return;

        try {
            this.torchEnabled = !this.torchEnabled;
            await track.applyConstraints({ advanced: [{ torch: this.torchEnabled }] });
        } catch (e) {
            console.warn('Torch toggle failed:', e);
            this.showNotification('الفلاش غير مدعوم على هذا الجهاز.', 'warning');
        }
    }

    simulateEnrollmentProcess(studentId) {
        const progressBar = document.getElementById('enroll-progress-bar');
        const progressText = document.getElementById('enroll-progress-text');
        const instructions = document.getElementById('palm-enroll-instructions');
        if (!progressBar) return;

        let progress = 0;
        instructions.textContent = 'جاري التقاط بصمة الكف... ثبّت يدك أمام الكاميرا.';
        const timer = setInterval(() => {
            progress = Math.min(100, progress + Math.round(Math.random() * 18) + 8);
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `التقدم: ${progress}%`;

            if (progress >= 100) {
                clearInterval(timer);
                // Save a simple template placeholder
                if (studentId) {
                    this.palmTemplates[studentId] = {
                        enrolledAt: new Date().toISOString(),
                        deviceId: this.currentVideoDeviceId || null
                    };
                    this.saveData();
                }
                this.showNotification('تم تسجيل بصمة الكف بنجاح (محاكاة).', 'success');
                this.hidePalmEnrollModal();
                if (this.currentStudentProfile) {
                    this.populatePalmPrintStatus(this.currentStudentProfile);
                }
            }
        }, 500);
    }

    simulateVerificationProcess() {
        const instructions = document.getElementById('palm-enroll-instructions');
        instructions.textContent = 'تحليل بصمة الكف...';
        setTimeout(() => {
            // In demo mode we cannot identify a specific student
            this.showNotification('ميزة التحقق بالبصمة في وضع تجريبي. استخدم QR/الكود حالياً.', 'warning');
            this.hidePalmEnrollModal();
        }, 1500);
    }

    deletePalmTemplate(studentId) {
        if (!studentId) return;
        if (!this.palmTemplates[studentId]) {
            this.showNotification('لا توجد بصمة مسجلة لهذا الطالب.', 'warning');
            return;
        }
        if (confirm('هل تريد حذف بصمة الكف لهذا الطالب؟')) {
            delete this.palmTemplates[studentId];
            this.saveData();
            this.showNotification('تم حذف بصمة الكف.', 'success');
            if (this.currentStudentProfile && this.currentStudentProfile.id === studentId) {
                this.populatePalmPrintStatus(this.currentStudentProfile);
            }
        }
    }

    showNotification(message, type = 'success', duration = 3000) {
        const notification = document.getElementById('notification');
        const messageElement = notification.querySelector('.notification-message');
        const iconElement = notification.querySelector('.notification-icon');

        notification.className = `notification ${type}`;
        messageElement.textContent = message;

        if (type === 'success') {
            iconElement.className = 'notification-icon fas fa-check-circle';
        } else if (type === 'error') {
            iconElement.className = 'notification-icon fas fa-exclamation-circle';
        } else if (type === 'warning') {
            iconElement.className = 'notification-icon fas fa-exclamation-triangle';
        }

        notification.classList.add('show');

        setTimeout(() => {
            notification.classList.remove('show');
        }, duration);
    }

    initAudioContext() {
        if (!this.audioContext) {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.error("Web Audio API is not supported in this browser");
            }
        }
    }

    playWarningSound() {
        if (!this.audioContext) {
            this.initAudioContext();
            if(!this.audioContext) return;
        }

        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime); 
            gainNode.gain.setValueAtTime(0.5, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, this.audioContext.currentTime + 0.5);

            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.5);
        } catch(e) {
            console.error("Error playing sound: ", e);
        }
    }

    findLastStudentStatus(studentId) {
        const sortedDates = Object.keys(this.attendance)
            .filter(date => date < this.currentDate) 
            .sort()
            .reverse();
        
        for (const date of sortedDates) {
            const record = this.attendance[date][studentId];
            if (record) {
                return record.status; 
            }
        }
        return null; 
    }

    async showAbsentAlert(student) {
        return new Promise((resolve) => {
            const modal = document.getElementById('absent-alert-modal');
            const message = document.getElementById('absent-alert-message');
            const confirmBtn = document.getElementById('absent-alert-confirm');
            const cancelBtn = document.getElementById('absent-alert-cancel');
    
            message.innerHTML = `الطالب <strong>${student.name}</strong> (مجموعة: ${student.group || 'غير محدد'}) تم تسجيله <strong>غائب</strong> في الحصة/اليوم السابق.`;
            
            this.startAbsentAlarm();
            modal.classList.add('show');
    
            const closeAndResolve = (value) => {
                this.stopAbsentAlarm();
                modal.classList.remove('show');
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
                resolve(value);
            };
            
            confirmBtn.onclick = () => closeAndResolve(true);
            cancelBtn.onclick = () => closeAndResolve(false);
        });
    }

    toggleAbsenceMakeup(studentId, date, currentStatus) {
        const action = () => {
            const student = this.students.find(s => s.id === studentId);
            if (!student || !this.attendance[date] || !this.attendance[date][studentId]) {
                this.showNotification('خطأ: لم يتم العثور على سجل الحضور.', 'error');
                return;
            }

            const record = this.attendance[date][studentId];
            let newStatus, logMessage, notificationMessage;

            if (currentStatus === 'absent') {
                newStatus = 'makeup';
                record.status = newStatus;
                record.method = 'manual';
                // When converting to makeup, it means the student has attended a different session.
                // We'll mark the attended group same as original, it will be updated upon actual attendance.
                record.attendedGroup = record.attendedGroup || student.group; 
                record.originalGroup = student.group;
                record.time = new Date().toTimeString().slice(0, 5);
                
                logMessage = `تم تحويل حالة الطالب ${student.name} من غياب إلى تعويض ليوم ${date}`;
                notificationMessage = `تم تحويل الحالة إلى "تعويض" بنجاح.`;
            } else if (currentStatus === 'makeup') {
                newStatus = 'absent';
                record.status = newStatus;
                // We can clear makeup-specific info
                delete record.time;
                delete record.attendedGroup;
                delete record.originalGroup;

                logMessage = `تم إرجاع حالة الطالب ${student.name} من تعويض إلى غياب ليوم ${date}`;
                notificationMessage = 'تم إرجاع الحالة إلى "غياب" بنجاح.';
            } else {
                return;
            }

            this.saveData();
            this.logActivity(logMessage, 'alert');
            this.showNotification(notificationMessage, 'success');

            // Refresh profile view if it's open for the same student
            if (this.currentStudentProfile && this.currentStudentProfile.id === studentId) {
                this.loadAttendanceHistory(studentId);
            }
        };

        const title = currentStatus === 'absent' ? 'تأكيد تحويل الحالة إلى تعويض' : 'تأكيد إرجاع الحالة إلى غياب';
        this.promptForPassword(action, title);
    }

    startAbsentAlarm() {
        if (!this.audioContext) this.initAudioContext();
        if (!this.audioContext || this.absentAlarmInterval) return;
    
        const playBeep = () => {
            if(!this.audioContext) return;
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(1200, this.audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.4, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.3);
    
            oscillator.start();
            oscillator.stop(this.audioContext.currentTime + 0.3);
        };
        
        playBeep(); 
        this.absentAlarmInterval = setInterval(playBeep, 600);
    }
    
    stopAbsentAlarm() {
        if (this.absentAlarmInterval) {
            clearInterval(this.absentAlarmInterval);
            this.absentAlarmInterval = null;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new AttendanceApp();
});