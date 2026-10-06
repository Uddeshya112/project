
    for (const [key, json] of changedDocs) this.lastWritten.set(key, json);
    for (const [key, version] of newDocVersions) this.docVersion.set(key, version);
    for (const v of [...newVersions, ...flagChanges]) this.persistedVersions.set(v.versionNumber, v.isPublished);
    this.pendingAudit = this.pendingAudit.slice(audit.length);
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  getBootstrapState(viewer: Viewer) {
    const staff = STAFF_ROLES.includes(viewer.roleCode);
    const roster = this.rosterContext(viewer);
    const activeVersion = staff && this.activeVersionNumber != null
      ? this.versions.find((v) => v.versionNumber === this.activeVersionNumber)
      : undefined;
    const workingSessions = staff && activeVersion && this.activeSessions.length !== activeVersion.sessions.length
      ? clone(activeVersion.sessions)
      : this.activeSessions;
    const allSessions = staff ? workingSessions : this.publishedSessions;
    const visibleSessions = viewer.roleCode === 'STUDENT' || viewer.roleCode === 'CLASS_REPRESENTATIVE'
      ? allSessions.filter((s) => !roster.sectionId || s.sectionId === roster.sectionId)
      : viewer.roleCode === 'FACULTY' && roster.facultyId
        ? allSessions.filter((s) => s.facultyId === roster.facultyId)
        : allSessions;

    const visibleCourseIds = new Set(visibleSessions.map((s) => s.courseId));
    const visibleFacultyIds = new Set(visibleSessions.map((s) => s.facultyId));
    const visibleRoomIds = new Set(visibleSessions.map((s) => s.roomId));

    const courses = staff ? [...this.courses.values()] : [...this.courses.values()].filter((c) => visibleCourseIds.has(c.id));
    const facultyMembers = staff
      ? [...this.facultyMembers.values()]
      : [...this.facultyMembers.values()]
          .filter((f) => visibleFacultyIds.has(f.id))
          .map((f) => ({ ...f, email: '', avatarUrl: undefined, employeeId: undefined }));
    const rooms = staff ? [...this.rooms.values()] : [...this.rooms.values()].filter((r) => visibleRoomIds.has(r.id));
    const sections = staff
      ? [...this.groups.values()]
      : roster.sectionId
        ? [...this.groups.values()].filter((s) => s.id === roster.sectionId)
        : [];

    return {
      academicYear: this.academicYear,
      departments: [...this.departments.values()],