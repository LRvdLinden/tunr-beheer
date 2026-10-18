import Charts
import SwiftUI

/// Overzicht (actie `stats`): kengetallen, grafiekkaart Gebruikers (stijl Homey Insights, periode + offset) en de
/// verdelingen. De kengetallen en verdelingen gaan over nu; de grafiek over de gekozen periode.
struct OverviewView: View {
    @EnvironmentObject private var session: Session
    @State private var stats: Stats?
    @State private var loadedAt: Date?
    @State private var loadedQuery: StatsQuery?
    @State private var loading = false
    @State private var error: String?
    @State private var query = StatsQuery.saved
    @State private var showActive = true
    @State private var showNew = true
    @State private var expanded = false

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
        .refreshable { await load(query, force: true) }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                RefreshButton(busy: loading) { Task { await load(query, force: true) } }
            }
        }
        // nieuwe periode of offset: opnieuw laden (de vorige aanvraag wordt afgebroken)
        .task(id: query) { await load(query) }
        .onChange(of: query) { _, q in
            UserDefaults.standard.set(q.range.rawValue, forKey: StatsQuery.defaultsKey)
        }
        .onChange(of: session.refreshTick) { _, _ in
            Task { await load(query, force: true) }
        }
        .insightsPresentation(isPresented: $expanded) {
            expandedChart
        }
    }

    /// Vergrote grafiek (schermvullend op iPhone/iPad, sheet op de Mac).
    private var expandedChart: some View {
        NavigationStack {
            ScrollView {
                if let stats {
                    InsightsCard(stats: stats, query: $query, showActive: $showActive, showNew: $showNew,
                                 loading: loading, expanded: true, onExpand: { expanded = false })
                        .padding(BeheerTheme.edge)
                        .frame(maxWidth: 1400)
                        .frame(maxWidth: .infinity)
                }
            }
            .screenBackground()
            .navigationTitle(L("Gebruikers"))
            .inlineTitle()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L("Klaar")) { expanded = false }
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 860, minHeight: 680)
        #endif
        .preferredColorScheme(.dark)
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

        InsightsCard(stats: s, query: $query, showActive: $showActive, showNew: $showNew,
                     loading: loading, onExpand: { expanded = true })

        LazyVGrid(columns: cardColumns, alignment: .leading, spacing: 12) {
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

    /// Laadt `stats` voor periode `q`. Binnen een minuut dezelfde periode opnieuw: niets doen (tenzij `force`).
    private func load(_ q: StatsQuery, force: Bool = false) async {
        if !force, loadedQuery == q, let loadedAt, Date().timeIntervalSince(loadedAt) < 60 {
            loading = false
            return
        }
        loading = true
        defer { if query == q { loading = false } }
        do {
            let s = try await session.call("stats", ["days": q.range.rawValue, "offset": q.offset], as: Stats.self)
            try Task.checkCancellation()
            guard q == query else { return }
            withAnimation(.easeInOut(duration: 0.25)) {
                stats = s
            }
            loadedQuery = q
            loadedAt = Date()
            error = nil
        } catch {
            if error is CancellationError { return }
            if let e = error as? APIError, e.isUnauthorized { return }
            self.error = (error as? APIError)?.errorDescription ?? L("Er ging iets mis.")
        }
    }
}
