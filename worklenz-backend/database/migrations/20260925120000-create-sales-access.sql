CREATE TABLE IF NOT EXISTS sales_access (
    id         UUID                     DEFAULT uuid_generate_v4() NOT NULL,
    team_id    UUID                                                NOT NULL,
    user_id    UUID                                                NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP  NOT NULL,
    CONSTRAINT sales_access_pk PRIMARY KEY (id),
    CONSTRAINT sales_access_team_user_unique UNIQUE (team_id, user_id),
    CONSTRAINT sales_access_team_id_fk FOREIGN KEY (team_id) REFERENCES teams ON DELETE CASCADE,
    CONSTRAINT sales_access_user_id_fk FOREIGN KEY (user_id) REFERENCES users ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sales_access_team_id ON sales_access (team_id);
CREATE INDEX IF NOT EXISTS idx_sales_access_user_id ON sales_access (user_id);
