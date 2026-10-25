// PostgreSQL 15 catalog reads only. Object identities use names, never cross-database OIDs.
const schemas = "n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'"
export const catalogQueries = {
  schemas: `SELECT n.nspname AS key, pg_get_userbyid(n.nspowner) AS owner,
    n.nspacl::text AS acl FROM pg_namespace n WHERE ${schemas} ORDER BY 1`,
  relations: `SELECT n.nspname||'.'||c.relname AS key, c.relkind, c.relpersistence,
    pg_get_userbyid(c.relowner) AS owner, c.relacl::text AS acl, c.reloptions,
    c.relrowsecurity, c.relforcerowsecurity, c.relreplident, am.amname AS access_method,
    ts.spcname AS tablespace
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_am am ON am.oid=c.relam LEFT JOIN pg_tablespace ts ON ts.oid=c.reltablespace
    WHERE ${schemas} AND c.relkind IN ('r','p','v','m','f') ORDER BY 1`,
  columns: `SELECT n.nspname||'.'||c.relname||'.'||a.attname AS key, a.attnum AS position,
    tn.nspname||'.'||t.typname AS type, a.atttypmod AS modifier,
    format_type(a.atttypid,a.atttypmod) AS formatted_type,
    a.attnotnull AS not_null, a.attidentity AS identity, a.attgenerated AS generated,
    pg_get_expr(d.adbin,d.adrelid,false) AS expression,
    cn.nspname||'.'||co.collname AS collation, a.attstorage AS storage,
    a.attcompression AS compression, a.attstattarget AS statistics_target, a.attoptions,
    a.attacl::text AS acl
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_type t ON t.oid=a.atttypid
    JOIN pg_namespace tn ON tn.oid=t.typnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    LEFT JOIN pg_collation co ON co.oid=a.attcollation LEFT JOIN pg_namespace cn ON cn.oid=co.collnamespace
    WHERE ${schemas} AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1`,
  constraints: `SELECT n.nspname||'.'||COALESCE(t.relname,'<domain>')||'.'||c.conname AS key,
    n.nspname AS schema, t.relname AS table, c.conname AS name, c.contype AS type,
    c.convalidated AS validated, c.condeferrable, c.condeferred, c.connoinherit,
    rn.nspname||'.'||rt.relname AS referenced_table, c.confupdtype, c.confdeltype, c.confmatchtype,
    ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(num,ord)
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.ord)::text[] AS columns,
    ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(num,ord)
      JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.ord)::text[] AS referenced_columns,
    pg_get_constraintdef(c.oid,false) AS definition
    FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
    LEFT JOIN pg_class t ON t.oid=c.conrelid LEFT JOIN pg_class rt ON rt.oid=c.confrelid
    LEFT JOIN pg_namespace rn ON rn.oid=rt.relnamespace WHERE ${schemas} ORDER BY 1`,
  indexes: `SELECT n.nspname||'.'||ic.relname AS key, n.nspname||'.'||tc.relname AS table,
    am.amname AS method, i.indisunique, i.indisprimary, i.indisexclusion,
    i.indisvalid, i.indisready, i.indislive, i.indimmediate, i.indisclustered,
    i.indisreplident, i.indnullsnotdistinct, i.indnkeyatts, i.indnatts,
    ARRAY(SELECT pg_get_indexdef(i.indexrelid,k,false) FROM generate_series(1,i.indnatts) k) AS keys,
    ARRAY(SELECT ns.nspname||'.'||op.opcname FROM unnest(i.indclass::oid[]) WITH ORDINALITY v(id,ord)
      JOIN pg_opclass op ON op.oid=v.id JOIN pg_namespace ns ON ns.oid=op.opcnamespace ORDER BY ord) AS opclasses,
    ARRAY(SELECT ns.nspname||'.'||co.collname FROM unnest(i.indcollation::oid[]) WITH ORDINALITY v(id,ord)
      LEFT JOIN pg_collation co ON co.oid=v.id LEFT JOIN pg_namespace ns ON ns.oid=co.collnamespace ORDER BY ord) AS collations,
    ts.spcname AS tablespace, i.indoption::text AS options, pg_get_expr(i.indexprs,i.indrelid,false) AS expression,
    pg_get_expr(i.indpred,i.indrelid,false) AS predicate, ic.reloptions
    FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_class tc ON tc.oid=i.indrelid
    JOIN pg_namespace n ON n.oid=tc.relnamespace JOIN pg_am am ON am.oid=ic.relam
    LEFT JOIN pg_tablespace ts ON ts.oid=ic.reltablespace WHERE ${schemas} ORDER BY 1`,
  sequences: `SELECT n.nspname||'.'||c.relname AS key, format_type(s.seqtypid,NULL) AS type,
    s.seqstart::text, s.seqincrement::text, s.seqmin::text, s.seqmax::text, s.seqcache::text, s.seqcycle,
    pg_get_userbyid(c.relowner) AS owner, c.relacl::text AS acl,
    rn.nspname||'.'||r.relname||'.'||a.attname AS owned_by, d.deptype
    FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=c.oid
      AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i')
    LEFT JOIN pg_class r ON r.oid=d.refobjid LEFT JOIN pg_namespace rn ON rn.oid=r.relnamespace
    LEFT JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum=d.refobjsubid WHERE ${schemas} ORDER BY 1`,
  extensions: `SELECT e.extname AS key,e.extversion,n.nspname AS schema,pg_get_userbyid(e.extowner) AS owner
    FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY 1`,
  views: `SELECT n.nspname||'.'||c.relname AS key,c.relkind,pg_get_viewdef(c.oid,false) AS definition
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${schemas} AND c.relkind IN ('v','m') ORDER BY 1`,
  routines: `SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS key,
    p.prokind,p.provolatile,p.proisstrict,p.prosecdef,p.proleakproof,p.proparallel,p.proconfig,
    p.procost,p.prorows,p.proretset,p.pronargdefaults,p.proargnames,
    CASE WHEN p.prokind IN ('f','p') THEN pg_get_functiondef(p.oid) ELSE NULL END AS definition,
    pg_get_userbyid(p.proowner) AS owner,p.proacl::text AS acl,l.lanname,
    pg_get_function_result(p.oid) AS result,p.prosrc,p.probin,
    pg_get_expr(p.proargdefaults,0,false) AS defaults,
    EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') AS extension_owned
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE ${schemas} ORDER BY 1`,
  triggers: `SELECT n.nspname||'.'||c.relname||'.'||CASE WHEN t.tgisinternal
      THEN 'constraint:'||co.conname||':'||fn.nspname||'.'||p.proname||':'||t.tgtype::text
      ELSE t.tgname::text END AS key,t.tgenabled,t.tgisinternal,t.tgtype,
    fn.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS function,
    t.tgdeferrable,t.tginitdeferred,t.tgoldtable,t.tgnewtable,encode(t.tgargs,'hex') AS arguments,
    ARRAY(SELECT a.attname FROM unnest(t.tgattr::smallint[]) WITH ORDINALITY v(num,ord)
      JOIN pg_attribute a ON a.attrelid=t.tgrelid AND a.attnum=v.num ORDER BY ord) AS columns,
    CASE WHEN NOT t.tgisinternal THEN pg_get_triggerdef(t.oid,false) END AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace fn ON fn.oid=p.pronamespace
    LEFT JOIN pg_constraint co ON co.oid=t.tgconstraint
    WHERE ${schemas} ORDER BY 1`,
  rules: `SELECT n.nspname||'.'||c.relname||'.'||r.rulename AS key,r.ev_enabled,
    pg_get_ruledef(r.oid,false) AS definition FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${schemas} ORDER BY 1`,
  policies: `SELECT schemaname||'.'||tablename||'.'||policyname AS key,permissive,roles,cmd,qual,with_check
    FROM pg_policies WHERE schemaname !~ '^pg_' AND schemaname<>'information_schema' ORDER BY 1`,
  unsupported: `SELECT 'relation:'||n.nspname||'.'||c.relname AS key,'foreign/partitioned table' AS kind
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${schemas} AND (c.relkind IN ('f','p') OR c.relispartition)
    UNION ALL SELECT 'inheritance:'||n.nspname||'.'||c.relname,'table inheritance' FROM pg_inherits i
    JOIN pg_class c ON c.oid=i.inhrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${schemas}
    UNION ALL SELECT 'type:'||n.nspname||'.'||t.typname,'custom type/domain/enum' FROM pg_type t
    JOIN pg_namespace n ON n.oid=t.typnamespace WHERE ${schemas} AND t.typrelid=0 AND t.typelem=0
      AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_type'::regclass AND d.objid=t.oid AND d.deptype='e')
    UNION ALL SELECT 'event-trigger:'||evtname,'event trigger' FROM pg_event_trigger
    UNION ALL SELECT 'aggregate:'||n.nspname||'.'||p.proname,'aggregate' FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE ${schemas} AND p.prokind='a'
    ORDER BY 1`,
  migrations: `SELECT name AS key,batch,migration_time FROM public.adonis_schema ORDER BY name`,
  migrationVersions: `SELECT version::text AS key FROM public.adonis_schema_versions ORDER BY version`,
}
