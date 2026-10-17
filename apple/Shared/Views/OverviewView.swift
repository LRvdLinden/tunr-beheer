import Charts
import SwiftUI

/// Overzicht (actie `stats`): kengetallen, grafiek Actief + Nieuw per dag (30 dagen) en de verdelingen.
struct OverviewView: View {
    @EnvironmentObject private var session: Session
    @State private var stats: Stats?
    @State private var loadedAt: Date?
    @State private var loading = false
    @State private var error: String?

    private let kpiColumns = [GridItem(.adaptive(minimum: 150), spacing: 12, alignment: .top)]
    private let cardColumns = [GridItem(.adaptive(minimum: 340), spacing: 12, alignment: .top)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if let error {
                    NoticeBanner(text: error)
                }
                if let stats {
                    content(stats)
                } else if error == nil {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                }
            }
            .padding(BeheerTheme.edge)
            .frame(maxWidth: 1200, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .screenBackground()
        .navigationTitle(L("Overzicht"))
        .largeTitle()
        .refreshable { await load() }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                RefreshButton(busy: loading) { Task { await load() } }
            }
        }
        .task { if stats == nil { await load() } }
        .onChange(of: session.refreshTick) { _, _ in
            Task { await load() }
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(L("Anonieme gebruiksstatistieken van alle Tunr-apps en de webspeler."))
                .font(.subheadline)
                .foregroundStyle(BeheerTheme.secondary)
            Spacer(minLength: 8)
            if let loadedAt {
                Text(String(format: L("Bijgewerkt om %@"), Fmt.time(loadedAt)))
                    .font(.caption)
                    .foregroundStyle(BeheerTheme.dim)
                    .lineLimit(1)
            }
        }
    }

    @ViewBuilder private func content(_ s: Stats) -> some View {
        let t = s.totals
        LazyVGrid(columns: kpiColumns, alignment: .leading, spacing: 12) {
            KPITile(title: L("Gebruikers totaal"), value: t.installs, icon: "person.3.fill", highlight: true)
            KPITile(title: L("Actief vandaag"), value: t.activeToday, icon: "dot.radiowaves.left.and.right")
            KPITile(title: L("Actief 7 dagen"), value: t.active7d, icon: "calendar")
            KPITile(title: L("Actief 30 dagen"), value: t.active30d, icon: "calendar.badge.clock")
            KPITile(title: L("Nieuw vandaag"), value: t.newToday, icon: "sparkles")
            KPITile(title: L("Nieuw 7 dagen"), value: t.new7d, icon: "person.badge.plus")
            KPITile(title: L("CarPlay / Android Auto"), value: t.carplay, icon: "car.fill")
        }

        LazyVGrid(columns: cardColumns, alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader(title: L("Actief per dag"), subtitle: L("Laatste 30 dagen"))
                ActiveChart(points: s.perDay)
            }
            .card()

            VStack(alignment: .leading, spacing: 12) {
                SectionHeader(title: L("Nieuw per dag"), subtitle: L("Laatste 30 dagen"))
                NewChart(points: s.perDay)
            }
            .card()

            distribution(L("Per platform"), L("Gebruikers (actief 30 dagen)"), rows: s.platforms.map {
                BarList.Row(id: $0.key, label: Fmt.platform($0.key), icon: Fmt.platformIcon($0.key),
                            detail: activeDetail($0), value: $0.installs)
            })

            distribution(L("Per type apparaat"), L("Gebruikers (actief 30 dagen)"), rows: s.devices.map {
                BarList.Row(id: $0.key, label: Fmt.device($0.key), icon: Fmt.deviceIcon($0.key),
                            detail: activeDetail($0), value: $0.installs)
            })

            distribution(L("App-versies"), L("Top 12, actief 30 dagen"), rows: s.versions.map {
                BarList.Row(id: $0.key, label: $0.key.isEmpty ? L("Onbekend") : $0.key, icon: "number", value: $0.installs)
            })

            distribution(L("Landen"), L("Top 15, actief 30 dagen"), rows: s.countries.map {
                BarList.Row(id: $0.key, label: Fmt.country($0.key), leading: Fmt.flag($0.key), value: $0.installs)
            })

            distribution(L("Talen"), L("Actief 30 dagen"), rows: s.langs.map {
                BarList.Row(id: $0.key, label: Fmt.language($0.key), icon: "character.bubble", value: $0.installs)
            })
        }
    }

    private func activeDetail(_ b: Bucket) -> String? {
        guard let a = b.active30d else { return nil }
        return "(\(Fmt.num(a)))"
    }

    private func distribution(_ title: String, _ subtitle: String, rows: [BarList.Row]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: title, subtitle: subtitle)
            BarList(rows: rows)
        }
        .card()
    }

    private func load() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let s = try await session.call("stats", ["days": 30], as: Stats.self)
            stats = s
            loadedAt = Date()
            error = nil
        } catch {
            if error is CancellationError { return }
            if let e = error as? APIError, e.isUnauthorized { return }
            self.error = (error as? APIError)?.errorDescription ?? L("Er ging iets mis.")
        }
    }
}

// MARK: - Grafieken

/// Actieve gebruikers per dag: vlak + lijn in het accentverloop, met selectie.
struct ActiveChart: View {
    let points: [DayPoint]
    @State private var selected: Date?

    private var selectedPoint: DayPoint? {
        guard let selected else { return nil }
        return points.first { Calendar.current.isDate($0.date, inSameDayAs: selected) }
    }

    var body: some View {
        if points.isEmpty {
            EmptyChart()
        } else {
            Chart {
                ForEach(points) { p in
                    AreaMark(x: .value(L("Dag"), p.date, unit: .day),
                             y: .value(L("Actief"), p.active))
                        .interpolationMethod(.monotone)
                        .foregroundStyle(LinearGradient(colors: [BeheerTheme.accent.opacity(0.45), BeheerTheme.accent.opacity(0.02)],
                                                        startPoint: .top, endPoint: .bottom))
                    LineMark(x: .value(L("Dag"), p.date, unit: .day),
                             y: .value(L("Actief"), p.active))
                        .interpolationMethod(.monotone)
                        .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round))
                        .foregroundStyle(BeheerTheme.barGradient)
                }
                if let s = selectedPoint {
                    RuleMark(x: .value(L("Dag"), s.date, unit: .day))
                        .foregroundStyle(Color.white.opacity(0.2))
                        .annotation(position: .top, alignment: .center, spacing: 4) {
                            ChartTooltip(value: s.active, unit: L("actief"), date: s.date)
                        }
                    PointMark(x: .value(L("Dag"), s.date, unit: .day),
                              y: .value(L("Actief"), s.active))
                        .foregroundStyle(BeheerTheme.accent2)
                }
            }
            .chartXSelection(value: $selected)
            .chartXAxis { dayAxis(count: points.count) }
            .chartYAxis { valueAxis() }
            .frame(height: 210)
        }
    }
}

/// Nieuwe gebruikers per dag: staafjes.
struct NewChart: View {
    let points: [DayPoint]
    @State private var selected: Date?

    private var selectedPoint: DayPoint? {
        guard let selected else { return nil }
        return points.first { Calendar.current.isDate($0.date, inSameDayAs: selected) }
    }

    var body: some View {
        if points.isEmpty {
            EmptyChart()
        } else {
            Chart {
                ForEach(points) { p in
                    BarMark(x: .value(L("Dag"), p.date, unit: .day),
                            y: .value(L("Nieuw"), p.new))
                        .cornerRadius(3)
                        .foregroundStyle(p.new == 0 ? Color.white.opacity(0.12)
                                         : (selectedPoint?.id == p.id ? BeheerTheme.accent2 : BeheerTheme.accent))
                }
                if let s = selectedPoint {
                    RuleMark(x: .value(L("Dag"), s.date, unit: .day))
                        .foregroundStyle(Color.white.opacity(0.12))
                        .annotation(position: .top, alignment: .center, spacing: 4) {
                            ChartTooltip(value: s.new, unit: L("nieuw"), date: s.date)
                        }
                }
            }
            .chartXSelection(value: $selected)
            .chartXAxis { dayAxis(count: points.count) }
            .chartYAxis { valueAxis() }
            .frame(height: 210)
        }
    }
}

struct EmptyChart: View {
    var body: some View {
        Text(L("Nog geen gegevens."))
            .font(.subheadline)
            .foregroundStyle(BeheerTheme.dim)
            .frame(maxWidth: .infinity, minHeight: 120)
    }
}

@MainActor
private func dayAxis(count: Int) -> some AxisContent {
    AxisMarks(values: .stride(by: .day, count: count <= 7 ? 1 : (count <= 14 ? 2 : 7))) { value in
        AxisGridLine().foregroundStyle(Color.clear)
        AxisValueLabel {
            if let d = value.as(Date.self) {
                Text(Fmt.shortDay(d))
            }
        }
    }
}

@MainActor
private func valueAxis() -> some AxisContent {
    AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { _ in
        AxisGridLine().foregroundStyle(Color.white.opacity(0.08))
        AxisValueLabel()
    }
}

struct ChartTooltip: View {
    let value: Int
    let unit: String
    let date: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: "\(Fmt.num(value)) \(unit)")
                .font(.caption.weight(.bold))
                .foregroundStyle(.white)
            Text(Fmt.longDay(date))
                .font(.caption2)
                .foregroundStyle(BeheerTheme.secondary)
        }
        .padding(8)
        .background(BeheerTheme.elevated, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}
