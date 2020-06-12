# main data source:
cmnts_url <- "https://safestreetsbury.commonplace.is/comments.json"
# map of bounds source:
map_url <- "https://safestreetsbury.commonplace.is/content/map.json"

library(rjson)
library(sf)

########## get the area boundary ############# ##################
# the framework determines all the tags/labels and map polygon bounds
framework <- paste0('data/framework_', Sys.Date(), '.json')
download.file(url=map_url, destfile = framework)

fw <- fromJSON(file=framework)

# get the long/lat
fwm_yx <- matrix(data = unlist(fw$map$boundaries[[1]]$coordinates), ncol = 2, byrow = T)
# reverse order of coordinates from y,x (lat,long) to x,y (long,lat)
fwm <- fwm_yx[,c(2,1)]

# make into sfc object
bounds <- st_sfc(st_polygon(list(fwm), dim = 'XY'))
st_crs(bounds) <- 4326

save_polygon <- '../data/map_bounds.geojson'
file.remove(save_polygon) # delete because write_sf throws warning for overwrite
write_sf(bounds, dsn=save_polygon)

########## get the comments ############# ##################

json_file <- paste0("data/SS_cmnts_", Sys.Date(), ".json")
# download and save with today's date
download.file(cmnts_url, json_file)

# import to R, convert from JSON
cmnts <- rjson::fromJSON(file = json_file, unexpected.escape = "skip")

# fields of interest
foi <- list(
         issue_tags="whatIsTheProblem",
         solution_tags="howImprove",
         want_perm="wouldYouSupportTheseChangesBeingMadeLongTerm",
         comment="anyOtherCommentsAboutThisLocation",
         short_desc="whatAreYouCommentingOn")

cmnts_clean <- lapply(cmnts, function(x) {
  # x <- cmnts[[6]]
  cid <- x$id
  feeling <- x$properties$feeling # 0,25, 50, 75, or 100
  consent <- x$properties$consent
  if( is.null(consent)) { consent <- NA}
  subdate <- x$properties$date
  votes <- x$properties$agree$number
  url <- strsplit(x = x$shortUrl, split = "[?]")[[1]][1]
  wgs_lat <- x$geometry$coordinates[2]
  wgs_long <- x$geometry$coordinates[1]
  
  # look for each of the fields of interest, foi
  xfoi <- sapply(foi, function(y) {
    # y <- foi[[2]]
    tmp <- sapply(x$properties$fields, function(z) {
      # z <- x$properties$fields[[1]]
      if( y != z$name ) {
        return(NA)
      }
      return(paste(z$value, collapse = "_,_"))
    })
  })
  
  # fields of interest results
  xfoir <- data.frame(t(apply(xfoi, MARGIN = 2, function(x) {
    if(all(is.na(x))) { return(NA)}
    x[!is.na(x)][[1]]
  })), stringsAsFactors = F)

  title <- xfoir$short_desc
  perm <- xfoir$want_perm
  comment <- gsub(pattern = "\n", replacement = "<br>", x = xfoir$comment)
  issues_csv <- xfoir$issue_tags
  suggest_csv <- xfoir$solution_tags
  
  return(data.frame(title=title,
                    cid=cid,
                    feeling=feeling,
                    consent=consent,
                    subdate=subdate,
                    votes=votes,
                    url=url,
                    lat=wgs_lat,
                    long=wgs_long,
                    wantperm=perm,
                    issues=issues_csv,
                    solutions=suggest_csv,
                    comment=comment,
                    stringsAsFactors = F))
})

ss <- do.call('rbind', cmnts_clean)

# fix dates from relative to absolute
now <- Sys.time()
ss$abdate <- NA
dt_in_days_ago <- grep(pattern="days", ss$subdate)
dt_a_day_ago <- grep(pattern="a day", ss$subdate)
dt_in_hours_ago <- grepl(pattern="hours", ss$subdate)
dt_an_hour_ago <- grepl(pattern="an hour", ss$subdate)
dt_in_mins_ago <- grepl(pattern="minutes", ss$subdate)

ss$abdate[dt_in_days_ago] <- strftime(now - (as.integer(unlist(strsplit(x = ss[dt_in_days_ago,"subdate"], split = " days ago"))) * 60 * 60 * 24), "%Y-%m-%d")
ss$abdate[dt_a_day_ago] <- strftime(now - (60 * 60 * 24), "%Y-%m-%d")
ss$abdate[dt_in_hours_ago] <- strftime(now - (as.integer(unlist(strsplit(x = ss[dt_in_hours_ago,"subdate"], split = " hours ago"))) * 60 * 60), "%Y-%m-%d")
ss$abdate[dt_an_hour_ago] <- strftime(now - (60 * 60), "%Y-%m-%d")
ss$abdate[dt_in_mins_ago] <- strftime(now - (as.integer(unlist(strsplit(x = ss[dt_in_mins_ago,"subdate"], split = " minutes ago"))) * 60), "%Y-%m-%d")

# check
any(is.na(ss$abdate))
ss$subdate[is.na(ss$abdate)]

# filter out bad data
# hack, but works for now
ss$comment <- iconv(ss$comment, from='latin1', to='utf8',sub = "")

# replace bit.ly urls with proper
base_url <- "https://safestreetsbury.commonplace.is/comments/"
ss$url <- paste0(base_url, ss$cid)

# export
#write.table(ss, file = 'www/data/data.tsv', quote = F, sep = "\t", row.names = F)
write(toJSON(split(ss, 1:nrow(ss))), '../data/cmnts.json')
