-- water schema: source drinking-water data. Every row carries snapshot_id
-- provenance (api.data_snapshots.id; no cross-schema FK so the refresh CLI
-- can rebuild water_staging and swap schemas atomically).

CREATE SCHEMA IF NOT EXISTS water;

CREATE TABLE water.utilities (
    pws_id            text PRIMARY KEY,
    name              text NOT NULL,
    state             char(2) NOT NULL,
    county            text,
    population_served integer NOT NULL CHECK (population_served >= 0),
    source_type       text,
    status            text NOT NULL DEFAULT 'Active',
    snapshot_id       bigint NOT NULL
);

CREATE TABLE water.utility_zips (
    pws_id text NOT NULL REFERENCES water.utilities(pws_id),
    zip    char(5) NOT NULL CHECK (zip ~ '^[0-9]{5}$'),
    PRIMARY KEY (pws_id, zip)
);
CREATE INDEX utility_zips_zip_idx ON water.utility_zips (zip);

CREATE TABLE water.violations (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pws_id          text NOT NULL REFERENCES water.utilities(pws_id),
    violation_id    text NOT NULL,
    contaminant     text,
    violation_type  text NOT NULL,
    category        text NOT NULL,
    is_health_based boolean NOT NULL,
    start_date      date NOT NULL,
    end_date        date,
    status          text NOT NULL,
    description     text,
    snapshot_id     bigint NOT NULL,
    UNIQUE (pws_id, violation_id)
);

CREATE TABLE water.contaminant_readings (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pws_id       text NOT NULL REFERENCES water.utilities(pws_id),
    contaminant  text NOT NULL,
    value        numeric NOT NULL,
    unit         text NOT NULL,
    sample_date  date NOT NULL,
    sample_point text,
    method       text,
    epa_limit    numeric,
    ewg_limit    numeric,
    national_avg numeric,
    snapshot_id  bigint NOT NULL
);
CREATE INDEX readings_pws_contaminant_idx
    ON water.contaminant_readings (pws_id, contaminant, sample_date DESC);

CREATE TABLE water.enforcement_actions (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pws_id      text NOT NULL REFERENCES water.utilities(pws_id),
    action_type text NOT NULL CHECK (action_type IN ('formal', 'informal')),
    action_date date NOT NULL,
    description text,
    snapshot_id bigint NOT NULL
);

CREATE TABLE water.hardness (
    zip         char(5) PRIMARY KEY CHECK (zip ~ '^[0-9]{5}$'),
    value_mg_l  numeric NOT NULL CHECK (value_mg_l >= 0),
    snapshot_id bigint NOT NULL
);

CREATE TABLE water.ccr_reports (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pws_id      text REFERENCES water.utilities(pws_id),
    year        integer NOT NULL CHECK (year BETWEEN 1990 AND 2100),
    report_url  text NOT NULL,
    report_type text NOT NULL DEFAULT 'PDF' CHECK (report_type IN ('PDF', 'PAGE')),
    notes       text,
    snapshot_id bigint NOT NULL
);
